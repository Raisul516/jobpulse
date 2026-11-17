// Database work for "paste a link" imports.
import { createHash } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { jobs, jobSourceRecords, jobSources } from "../db/schema";
import type { ExtractedJob } from "../types/extracted";
import { normalizeUrl } from "./normalizeUrl";
import { parseJobPage } from "./parseJobPage";
import { fetchPage, FetchPageError } from "./safeFetch";

const MANUAL_SOURCE = "Manual link";

const importColumns = {
  id: jobSourceRecords.id,
  sourceUrl: jobSourceRecords.sourceUrl,
  jobId: jobSourceRecords.jobId,
  extracted: jobSourceRecords.extracted,
  fetchError: jobSourceRecords.fetchError,
  reviewReason: jobSourceRecords.reviewReason,
  reviewStatus: jobSourceRecords.reviewStatus,
  fetchedAt: jobSourceRecords.fetchedAt,
};

export type ImportRecord = {
  id: number;
  sourceUrl: string;
  jobId: number | null;
  extracted: ExtractedJob | null;
  fetchError: string | null;
  reviewReason: string | null; // why an automatically collected job needs a human look
  reviewStatus: "pending" | "approved" | "rejected";
  fetchedAt: Date;
};

export type PossibleDuplicate = {
  id: number;
  title: string;
  company: string;
  deadline: string | null;
  reason: string;
};

async function manualSourceId(): Promise<number> {
  await db.insert(jobSources).values({ name: MANUAL_SOURCE, kind: "manual" }).onConflictDoNothing();
  const [row] = await db.select({ id: jobSources.id }).from(jobSources).where(eq(jobSources.name, MANUAL_SOURCE));
  return row.id;
}

// Fetch + parse a pasted link and store it as a PENDING draft.
// If the same link was imported before, return that one instead of making a copy.
export async function createImport(url: string): Promise<{ record: ImportRecord; alreadyExisted: boolean }> {
  const sourceId = await manualSourceId();
  const normalized = normalizeUrl(url);

  const [existing] = await db
    .select(importColumns)
    .from(jobSourceRecords)
    .where(and(eq(jobSourceRecords.sourceId, sourceId), eq(jobSourceRecords.normalizedUrl, normalized)));
  // Already reviewed: keep the user's decision, don't read the page again.
  if (existing && existing.reviewStatus !== "pending") return { record: existing, alreadyExisted: true };

  let html: string | null = null;
  let extracted: ExtractedJob | null = null;
  let fetchError: string | null = null;
  try {
    const page = await fetchPage(normalized);
    html = page.html;
    extracted = parseJobPage(page.html, page.finalUrl);
  } catch (err) {
    // Couldn't read the page (blocked, PDF, offline...). Keep the record so the user can fill it in by hand.
    if (!(err instanceof FetchPageError)) throw err;
    fetchError = err.message;
  }

  const snapshot = {
    rawTitle: extracted?.title?.value ?? null,
    rawCompany: extracted?.company?.value ?? null,
    rawContent: html,
    contentHash: html ? createHash("sha256").update(html).digest("hex") : null,
    extracted,
    fetchError,
    fetchedAt: new Date(),
  };

  // Still waiting for review: refresh the draft with a fresh read of the page
  // (the page may have changed, or JobPulse's parser may have improved since).
  if (existing) {
    const [refreshed] = await db
      .update(jobSourceRecords)
      .set(snapshot)
      .where(and(eq(jobSourceRecords.id, existing.id), eq(jobSourceRecords.reviewStatus, "pending")))
      .returning(importColumns);
    return { record: refreshed ?? (await findImportById(existing.id))!, alreadyExisted: true };
  }

  const [record] = await db
    .insert(jobSourceRecords)
    .values({ sourceId, sourceUrl: url, normalizedUrl: normalized, ...snapshot })
    // two requests for the same link at the same moment: keep the first
    .onConflictDoNothing()
    .returning(importColumns);

  if (!record) {
    const [winner] = await db
      .select(importColumns)
      .from(jobSourceRecords)
      .where(and(eq(jobSourceRecords.sourceId, sourceId), eq(jobSourceRecords.normalizedUrl, normalized)));
    return { record: winner, alreadyExisted: true };
  }
  return { record, alreadyExisted: false };
}

export async function findImports(status?: ImportRecord["reviewStatus"]): Promise<ImportRecord[]> {
  return db
    .select(importColumns)
    .from(jobSourceRecords)
    .where(
      and(
        status ? eq(jobSourceRecords.reviewStatus, status) : undefined,
        // a pending draft for a posting the company already took down is no longer worth reviewing
        status === "pending" ? isNull(jobSourceRecords.removedAt) : undefined
      )
    )
    .orderBy(desc(jobSourceRecords.fetchedAt))
    .limit(100);
}

export async function findImportById(id: number): Promise<ImportRecord | undefined> {
  const [row] = await db.select(importColumns).from(jobSourceRecords).where(eq(jobSourceRecords.id, id));
  return row;
}

// Existing open jobs that look like the same vacancy. The USER decides; we never merge automatically.
export async function findPossibleDuplicates(title?: string, company?: string): Promise<PossibleDuplicate[]> {
  if (!title || !company) return [];
  const titleScore = sql<number>`similarity(${jobs.title}, ${title})`;
  const companyScore = sql<number>`similarity(${jobs.company}, ${company})`;

  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: jobs.company,
      deadline: jobs.deadline,
      titleScore,
      companyScore,
    })
    .from(jobs)
    .where(and(eq(jobs.status, "open"), sql`${titleScore} > 0.45`, sql`${companyScore} > 0.45`))
    .orderBy(sql`${titleScore} + ${companyScore} DESC`)
    .limit(5);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    company: r.company,
    deadline: r.deadline,
    reason: `Title ${Math.round(r.titleScore * 100)}% similar, company ${Math.round(r.companyScore * 100)}% similar`,
  }));
}

export type ApprovedJobInput = {
  title: string;
  company: string;
  location: string;
  jobType: (typeof jobs.$inferInsert)["jobType"];
  category: (typeof jobs.$inferInsert)["category"];
  salaryMin: number | null;
  salaryMax: number | null;
  deadline: string | null;
  applyUrl: string | null;
  description: string | null;
};

export class ImportStateError extends Error {}
export class ImportNotFoundError extends Error {}

// User checked the draft. Either create a new job from their corrected values,
// or (if they said it's the same vacancy as an existing job) just link this source to it.
export async function approveImport(
  id: number,
  input: { job: ApprovedJobInput } | { linkToJobId: number }
): Promise<{ jobId: number; created: boolean }> {
  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({ status: jobSourceRecords.reviewStatus })
      .from(jobSourceRecords)
      .where(eq(jobSourceRecords.id, id))
      .for("update"); // lock the row so double-clicks can't create two jobs
    if (!record) throw new ImportNotFoundError();
    if (record.status !== "pending") throw new ImportStateError(`This import was already ${record.status}.`);

    let jobId: number;
    let created: boolean;
    if ("linkToJobId" in input) {
      const [target] = await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, input.linkToJobId));
      if (!target) throw new ImportStateError("The job to link to does not exist.");
      jobId = target.id;
      created = false;
    } else {
      const [job] = await tx.insert(jobs).values({ ...input.job, isDemo: false }).returning({ id: jobs.id });
      jobId = job.id;
      created = true;
    }

    await tx
      .update(jobSourceRecords)
      .set({ jobId, reviewStatus: "approved", reviewedAt: new Date() })
      .where(eq(jobSourceRecords.id, id));

    return { jobId, created };
  });
}

export async function rejectImport(id: number): Promise<void> {
  const rows = await db
    .update(jobSourceRecords)
    .set({ reviewStatus: "rejected", reviewedAt: new Date() })
    .where(and(eq(jobSourceRecords.id, id), eq(jobSourceRecords.reviewStatus, "pending")))
    .returning({ id: jobSourceRecords.id });
  if (rows.length === 0) {
    const exists = await findImportById(id);
    if (!exists) throw new ImportNotFoundError();
    throw new ImportStateError(`This import was already ${exists.reviewStatus}.`);
  }
}
