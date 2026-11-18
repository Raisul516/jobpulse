// Duplicate review: the same vacancy can arrive from two places (e.g. bdjobs and the company's
// own career page) with slightly different titles. JobPulse SUGGESTS pairs; the user decides.
// Nothing is ever merged automatically (handoff rule: no silent merges).
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { duplicateDismissals, jobs, jobSourceRecords, jobSources } from "../db/schema";

// How similar two jobs must be to be suggested (pg_trgm similarity, 0..1)
const TITLE_MIN = 0.5;
const COMPANY_MIN = 0.5;

type PairRow = {
  a_id: number;
  b_id: number;
  title_sim: number;
  company_sim: number;
  same_link: boolean;
  a_deadline: string | null;
  b_deadline: string | null;
};

export type JobSummary = {
  id: number;
  title: string;
  company: string;
  location: string;
  deadline: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  applyUrl: string | null;
  createdAt: Date;
  sources: string[];
};

export type DuplicatePair = { a: JobSummary; b: JobSummary; reasons: { text: string; warning: boolean }[]; score: number };

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

export async function findDuplicatePairs(limit = 30): Promise<DuplicatePair[]> {
  const result = await db.execute<PairRow>(sql`
    SELECT a.id AS a_id, b.id AS b_id,
           similarity(a.title, b.title) AS title_sim,
           similarity(a.company, b.company) AS company_sim,
           (a.apply_url IS NOT NULL AND a.apply_url = b.apply_url) AS same_link,
           a.deadline::text AS a_deadline, b.deadline::text AS b_deadline
    FROM jobs a
    JOIN jobs b ON a.id < b.id
    WHERE a.status = 'open' AND b.status = 'open'
      AND NOT a.is_demo AND NOT b.is_demo
      AND (
        (similarity(a.title, b.title) > ${TITLE_MIN} AND similarity(a.company, b.company) > ${COMPANY_MIN})
        OR (a.apply_url IS NOT NULL AND a.apply_url = b.apply_url)
      )
      AND NOT EXISTS (
        SELECT 1 FROM duplicate_dismissals d WHERE d.job_a_id = a.id AND d.job_b_id = b.id
      )
    ORDER BY similarity(a.title, b.title) + similarity(a.company, b.company) DESC
    LIMIT ${limit}
  `);
  const rows = result.rows;
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.flatMap((r) => [r.a_id, r.b_id]))];
  const summaries = await jobSummaries(ids);

  return rows.map((r) => {
    const reasons: DuplicatePair["reasons"] = [];
    if (r.same_link) reasons.push({ text: "Same application link", warning: false });
    reasons.push({ text: `Title ${Math.round(r.title_sim * 100)}% similar`, warning: false });
    reasons.push({ text: `Company ${Math.round(r.company_sim * 100)}% similar`, warning: false });
    if (r.a_deadline && r.b_deadline) {
      const days = daysBetween(r.a_deadline, r.b_deadline);
      reasons.push(
        days === 0
          ? { text: "Same deadline", warning: false }
          : days > 14
            ? { text: `Deadlines ${Math.round(days)} days apart — might be different vacancies`, warning: true }
            : { text: `Deadlines ${Math.round(days)} days apart`, warning: false }
      );
    }
    const a = summaries.get(r.a_id)!;
    const b = summaries.get(r.b_id)!;
    // the same title at the same company can be two openings in different cities
    if (a.location.trim().toLowerCase() !== b.location.trim().toLowerCase()) {
      reasons.push({ text: `Different locations (${a.location} / ${b.location}) — might be different vacancies`, warning: true });
    }
    return {
      a,
      b,
      reasons,
      score: Math.round(((Number(r.title_sim) + Number(r.company_sim)) / 2) * 100),
    };
  });
}

async function jobSummaries(ids: number[]): Promise<Map<number, JobSummary>> {
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: jobs.company,
      location: jobs.location,
      deadline: jobs.deadline,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      applyUrl: jobs.applyUrl,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .where(inArray(jobs.id, ids));
  const sourceRows = await db
    .select({ jobId: jobSourceRecords.jobId, name: jobSources.name, adapter: jobSources.adapter })
    .from(jobSourceRecords)
    .innerJoin(jobSources, eq(jobSources.id, jobSourceRecords.sourceId))
    .where(inArray(jobSourceRecords.jobId, ids));

  const map = new Map<number, JobSummary>();
  for (const row of rows) map.set(row.id, { ...row, sources: [] });
  for (const s of sourceRows) {
    const label = s.adapter === "manual" ? "Link you added" : s.name;
    const summary = s.jobId !== null ? map.get(s.jobId) : undefined;
    if (summary && !summary.sources.includes(label)) summary.sources.push(label);
  }
  return map;
}

export class DuplicateError extends Error {}

const ordered = (x: number, y: number) => (x < y ? [x, y] : [y, x]);

// "These are NOT the same" — never suggest this pair again.
export async function dismissPair(jobId1: number, jobId2: number): Promise<void> {
  if (jobId1 === jobId2) throw new DuplicateError("Choose two different jobs.");
  const [jobAId, jobBId] = ordered(jobId1, jobId2);
  await db.insert(duplicateDismissals).values({ jobAId, jobBId }).onConflictDoNothing();
}

// Keep `keepId`, fold `mergeId` into it, then delete `mergeId`.
export async function mergeJobs(keepId: number, mergeId: number): Promise<void> {
  if (keepId === mergeId) throw new DuplicateError("Choose two different jobs.");

  await db.transaction(async (tx) => {
    const both = await tx.select().from(jobs).where(inArray(jobs.id, [keepId, mergeId])).for("update");
    const keep = both.find((j) => j.id === keepId);
    const merge = both.find((j) => j.id === mergeId);
    if (!keep || !merge) throw new DuplicateError("One of these jobs no longer exists.");

    // 1. Fill details the kept job is missing
    const gainsDescription = !keep.description && Boolean(merge.description);
    await tx
      .update(jobs)
      .set({
        deadline: keep.deadline ?? merge.deadline,
        salaryMin: keep.salaryMin ?? merge.salaryMin,
        salaryMax: keep.salaryMax ?? merge.salaryMax,
        applyUrl: keep.applyUrl ?? merge.applyUrl,
        description: keep.description ?? merge.description,
        // new text = the old CV-similarity numbers are out of date
        ...(gainsDescription && { embedding: null }),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, keepId));

    // 2. Every site it was found on now points to the kept job
    await tx.update(jobSourceRecords).set({ jobId: keepId }).where(eq(jobSourceRecords.jobId, mergeId));

    // 3. Saved status and "already notified" move over — unless the kept job already has its own
    await tx.execute(sql`
      UPDATE saved_jobs SET job_id = ${keepId}
      WHERE job_id = ${mergeId}
        AND NOT EXISTS (SELECT 1 FROM saved_jobs s WHERE s.user_id = saved_jobs.user_id AND s.job_id = ${keepId})
    `);
    await tx.execute(sql`
      UPDATE notification_log SET job_id = ${keepId}
      WHERE job_id = ${mergeId}
        AND NOT EXISTS (
          SELECT 1 FROM notification_log n
          WHERE n.user_id = notification_log.user_id AND n.kind = notification_log.kind AND n.job_id = ${keepId}
        )
    `);

    // 4. Remove the merged job (anything left that still points to it is deleted with it)
    await tx.delete(jobs).where(and(eq(jobs.id, mergeId)));
  });
}
