// Runs a collector for one source and keeps the database in sync with what the platform shows.
//
//   new posting, complete, nothing similar already saved  -> added as a job automatically
//   new posting, something missing or looks like a duplicate -> waits for the user's review (/import page)
//   posting we already have                                -> updated if it changed
//   posting that disappeared from the platform             -> its job is marked "closed"
import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { jobs, jobSourceRecords, jobSources } from "../db/schema";
import { expireOldJobs } from "../lib/expireJobs";
import { embedMissingJobs } from "../lib/jobEmbeddings";
import { findPossibleDuplicates } from "../lib/importQueries";
import { normalizeUrl } from "../lib/normalizeUrl";
import { findDeadlineInText, findSalaryInText, normalizeLocation } from "../lib/parseJobPage";
import type { ExtractedJob } from "../types/extracted";
import type { JobCategory, JobType } from "../types/job";
import { COLLECTORS, CollectorName } from ".";
import { CollectorError } from "./http";
import type { CollectedJob } from "./types";

type Source = typeof jobSources.$inferSelect;

export type RunSummary = {
  ok: boolean;
  found: number;
  added: number;
  updated: number;
  needsReview: number;
  closed: number;
  message: string;
};

const MAX_DESCRIPTION = 5000;

// ---------- turning a platform posting into JobPulse fields ----------

export function mapJobType(text = "", title = ""): JobType | undefined {
  if (/\bintern(ship)?\b/i.test(text) || /\bintern(ship)?\b/i.test(title)) return "Internship";
  if (/part[\s-]?time/i.test(text)) return "Part-time";
  if (/contract|temporary|temp\b|fixed[\s-]?term|freelance/i.test(text)) return "Contract";
  if (/full[\s-]?time|permanent|regular/i.test(text)) return "Full-time";
  return undefined;
}

function mapLocation(job: CollectedJob): string | undefined {
  if (job.remote) return "Remote";
  const text = job.locationText?.trim();
  if (!text) return undefined;
  // Known Bangladeshi places get one standard spelling; anything else keeps its first part ("Singapore, SG" -> "Singapore")
  return normalizeLocation(text) ?? (text.split(",")[0].trim() || undefined);
}

export function toExtracted(job: CollectedJob, source: Pick<Source, "name" | "defaultCategory">): ExtractedJob {
  const s = <T>(value: T | undefined) => (value === undefined || value === "" ? undefined : { value, foundBy: "structured" as const });
  const t = <T>(value: T | undefined) => (value === undefined ? undefined : { value, foundBy: "text" as const });

  // Job type: what the platform says -> else look in the job text -> else assume Full-time (marked as a guess).
  // Some platforms (Greenhouse) never send it, and sending every such job to review would defeat automation.
  const typeFromPlatform = mapJobType(job.jobTypeText, job.title);
  const typeFromText = typeFromPlatform ? undefined : mapJobType(job.descriptionText.slice(0, 3000));
  const jobType: ExtractedJob["jobType"] = typeFromPlatform
    ? { value: typeFromPlatform, foundBy: "structured" }
    : typeFromText
      ? { value: typeFromText, foundBy: "text" }
      : { value: "Full-time", foundBy: "meta" };

  const category: JobCategory | undefined =
    jobType.value === "Internship" ? "Internship" : (source.defaultCategory ?? undefined);
  const salary = findSalaryInText(job.descriptionText);
  // Source names look like "Acme Ltd (Lever)"; the company is the part before the platform.
  const companyFromSource = source.name.replace(/\s*\([^)]*\)\s*$/, "");

  const extracted: ExtractedJob = {
    title: s(job.title.trim()),
    company: s(job.company.trim() || companyFromSource),
    location: s(mapLocation(job)),
    jobType,
    category: category ? { value: category, foundBy: "meta" } : undefined,
    deadline: t(findDeadlineInText(job.descriptionText)),
    salaryMin: t(salary?.min),
    salaryMax: t(salary?.max),
    applyUrl: s(job.applyUrl ?? job.url),
    description: s(job.descriptionText.slice(0, MAX_DESCRIPTION) || undefined),
  };
  for (const key of Object.keys(extracted) as (keyof ExtractedJob)[]) {
    if (extracted[key] === undefined) delete extracted[key];
  }
  return extracted;
}

const REQUIRED: (keyof ExtractedJob)[] = ["title", "company", "location", "jobType", "category"];

function jobValues(e: ExtractedJob) {
  return {
    title: e.title!.value,
    company: e.company!.value,
    location: e.location!.value,
    jobType: e.jobType!.value,
    category: e.category!.value,
    salaryMin: e.salaryMin?.value ?? null,
    salaryMax: e.salaryMax?.value ?? null,
    deadline: e.deadline?.value ?? null,
    applyUrl: e.applyUrl?.value ?? null,
    description: e.description?.value ?? null,
  };
}

// ---------- the run ----------

const running = new Set<number>(); // so the timer and a "Run now" click can't run the same source twice at once

export async function runSource(sourceId: number): Promise<RunSummary> {
  const [source] = await db.select().from(jobSources).where(eq(jobSources.id, sourceId));
  if (!source) throw new Error(`Source ${sourceId} not found`);
  if (source.adapter === "manual" || !source.externalKey) throw new Error("This source is not collected automatically");
  if (running.has(sourceId)) {
    return { ok: false, found: 0, added: 0, updated: 0, needsReview: 0, closed: 0, message: "Already running" };
  }

  running.add(sourceId);
  const startedAt = new Date();
  const summary: RunSummary = { ok: true, found: 0, added: 0, updated: 0, needsReview: 0, closed: 0, message: "" };

  try {
    const collector = COLLECTORS[source.adapter as CollectorName];
    const collected = await collector.fetchJobs(source.externalKey);
    summary.found = collected.length;

    for (const job of collected) {
      await syncOne(source, job, startedAt, summary);
    }
    summary.closed = await closeRemoved(source.id, startedAt);
    await expireOldJobs();

    summary.message =
      `Found ${summary.found}: ${summary.added} new, ${summary.updated} updated, ` +
      `${summary.needsReview} need review, ${summary.closed} closed`;
  } catch (err) {
    summary.ok = false;
    summary.message = err instanceof CollectorError ? err.message : "Unexpected error while collecting (see server log)";
    if (!(err instanceof CollectorError)) console.error(`Collector failed for source ${source.id}:`, err);
  } finally {
    running.delete(sourceId);
  }

  await db
    .update(jobSources)
    .set({
      lastRunAt: startedAt,
      lastRunOk: summary.ok,
      lastRunMessage: summary.message,
      ...(summary.ok && { lastFoundCount: summary.found }),
    })
    .where(eq(jobSources.id, source.id));

  return summary;
}

async function syncOne(source: Source, job: CollectedJob, seenAt: Date, summary: RunSummary) {
  const extracted = toExtracted(job, source);
  const normalized = normalizeUrl(job.url);
  const hash = createHash("sha256").update(JSON.stringify(job)).digest("hex");

  const [existing] = await db
    .select()
    .from(jobSourceRecords)
    .where(
      and(
        eq(jobSourceRecords.sourceId, source.id),
        or(eq(jobSourceRecords.externalId, job.externalId), eq(jobSourceRecords.normalizedUrl, normalized))
      )
    )
    .limit(1);

  const snapshot = {
    sourceUrl: job.url,
    normalizedUrl: normalized,
    externalId: job.externalId,
    rawTitle: job.title,
    rawCompany: extracted.company?.value ?? null,
    rawContent: JSON.stringify(job),
    contentHash: hash,
    extracted,
    lastSeenAt: seenAt,
    removedAt: null,
    fetchedAt: seenAt,
  };

  // ----- already known -----
  if (existing) {
    const changed = existing.contentHash !== hash;
    const reappeared = existing.removedAt !== null;
    await db.update(jobSourceRecords).set(changed ? snapshot : { lastSeenAt: seenAt, removedAt: null }).where(eq(jobSourceRecords.id, existing.id));

    if (existing.jobId && (changed || reappeared)) {
      const missing = REQUIRED.filter((k) => !extracted[k]);
      await db
        .update(jobs)
        .set({
          ...(changed && missing.length === 0 && jobValues(extracted)),
          // new text = old embedding is out of date; it will be recomputed
          ...(changed && missing.length === 0 && { embedding: null }),
          // back on the company's site -> open again (the expiry check closes it again if the deadline passed)
          ...(reappeared && { status: sql`CASE WHEN ${jobs.status} = 'closed' THEN 'open'::job_status ELSE ${jobs.status} END` }),
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, existing.jobId));
      summary.updated++;
    }
    return;
  }

  // ----- new posting -----
  const missing = REQUIRED.filter((k) => !extracted[k]);
  const duplicates = missing.length === 0 ? await findPossibleDuplicates(extracted.title!.value, extracted.company!.value) : [];

  if (missing.length === 0 && duplicates.length === 0) {
    await db.transaction(async (tx) => {
      const [created] = await tx.insert(jobs).values({ ...jobValues(extracted), isDemo: false }).returning({ id: jobs.id });
      await tx
        .insert(jobSourceRecords)
        .values({ ...snapshot, sourceId: source.id, jobId: created.id, reviewStatus: "approved", reviewedAt: seenAt })
        .onConflictDoNothing();
      // If the user had pasted this exact link earlier and not reviewed it yet, link that draft to the new job.
      await tx
        .update(jobSourceRecords)
        .set({ jobId: created.id, reviewStatus: "approved", reviewedAt: seenAt })
        .where(
          and(
            eq(jobSourceRecords.normalizedUrl, normalized),
            eq(jobSourceRecords.reviewStatus, "pending"),
            ne(jobSourceRecords.sourceId, source.id)
          )
        );
    });
    summary.added++;
    return;
  }

  const reasons = [
    missing.length ? `Missing: ${missing.join(", ")}` : "",
    duplicates.length ? `Looks like an existing job: ${duplicates.map((d) => `"${d.title}" at ${d.company}`).join("; ")}` : "",
  ].filter(Boolean);
  await db
    .insert(jobSourceRecords)
    .values({ ...snapshot, sourceId: source.id, reviewStatus: "pending", reviewReason: reasons.join(". ") })
    .onConflictDoNothing();
  summary.needsReview++;
}

// Postings not seen in this run were taken down by the company.
async function closeRemoved(sourceId: number, runStartedAt: Date): Promise<number> {
  const gone = await db
    .update(jobSourceRecords)
    .set({ removedAt: new Date() })
    .where(
      and(
        eq(jobSourceRecords.sourceId, sourceId),
        isNull(jobSourceRecords.removedAt),
        or(isNull(jobSourceRecords.lastSeenAt), lt(jobSourceRecords.lastSeenAt, runStartedAt))
      )
    )
    .returning({ jobId: jobSourceRecords.jobId });

  const jobIds = [...new Set(gone.map((g) => g.jobId).filter((id): id is number => id !== null))];
  if (jobIds.length === 0) return 0;

  // Close a job only if NO other source still lists it (the same vacancy can be on several sites).
  const closed = await db
    .update(jobs)
    .set({ status: "closed", updatedAt: new Date() })
    .where(
      and(
        inArray(jobs.id, jobIds),
        eq(jobs.status, "open"),
        sql`NOT EXISTS (SELECT 1 FROM job_source_records r WHERE r.job_id = "jobs"."id" AND r.removed_at IS NULL)`
      )
    )
    .returning({ id: jobs.id });
  return closed.length;
}

// Run every enabled automatic source, one after another.
export async function runAllSources(): Promise<void> {
  const sources = await db
    .select({ id: jobSources.id, name: jobSources.name })
    .from(jobSources)
    .where(and(eq(jobSources.enabled, true), sql`${jobSources.adapter} <> 'manual'`));
  for (const source of sources) {
    const result = await runSource(source.id);
    console.log(`[collect] ${source.name}: ${result.message}`);
  }
  void embedMissingJobs(); // embed the new jobs right away instead of waiting for the timer
}

const HOURS = Number(process.env.COLLECT_INTERVAL_HOURS) || 3;

export function startCollectorTimer(): void {
  const run = () => runAllSources().catch((err) => console.error("[collect] failed:", err));
  setTimeout(run, 10_000).unref(); // first run shortly after the server starts
  setInterval(run, HOURS * 60 * 60 * 1000).unref();
}
