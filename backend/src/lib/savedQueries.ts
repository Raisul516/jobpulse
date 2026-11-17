// Saved jobs and application tracking.
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { applicationStatusEnum, jobs, savedJobs } from "../db/schema";
import { jobColumns } from "./jobQueries";

export const APPLICATION_STATUSES = applicationStatusEnum.enumValues;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export class JobNotFoundError extends Error {}

export async function findSavedJobs(userId: number) {
  return db
    .select({
      job: jobColumns,
      status: savedJobs.status,
      notes: savedJobs.notes,
      appliedAt: savedJobs.appliedAt,
      savedAt: savedJobs.savedAt,
      updatedAt: savedJobs.updatedAt,
    })
    .from(savedJobs)
    .innerJoin(jobs, eq(jobs.id, savedJobs.jobId))
    .where(eq(savedJobs.userId, userId))
    // nearest deadline first; jobs without a deadline last
    .orderBy(sql`${jobs.deadline} ASC NULLS LAST`, sql`${savedJobs.savedAt} DESC`);
}

// Save a job, or update its status/notes if it's already saved.
export async function saveJob(
  userId: number,
  jobId: number,
  changes: { status?: ApplicationStatus; notes?: string | null }
) {
  const [job] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw new JobNotFoundError();

  const now = new Date();
  const becameApplied = changes.status === "applied";

  const [row] = await db
    .insert(savedJobs)
    .values({
      userId,
      jobId,
      status: changes.status ?? "saved",
      notes: changes.notes ?? null,
      appliedAt: becameApplied ? now : null,
    })
    .onConflictDoUpdate({
      target: [savedJobs.userId, savedJobs.jobId],
      set: {
        // only overwrite what the request actually sent
        ...(changes.status !== undefined && { status: changes.status }),
        ...(changes.notes !== undefined && { notes: changes.notes }),
        // remember the FIRST time it was marked applied
        ...(becameApplied && { appliedAt: sql`COALESCE(${savedJobs.appliedAt}, ${now.toISOString()}::timestamptz)` }),
        updatedAt: now,
      },
    })
    .returning();

  return row;
}

export async function unsaveJob(userId: number, jobId: number): Promise<boolean> {
  const rows = await db
    .delete(savedJobs)
    .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)))
    .returning({ jobId: savedJobs.jobId });
  return rows.length > 0;
}
