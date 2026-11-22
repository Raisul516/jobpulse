import { and, asc, desc, eq, gte, ilike, isNull, or, sql, SQL } from "drizzle-orm";
import { db } from "../db/client";
import { jobs, savedJobs } from "../db/schema";
import { Job, JobCategory, JobSort, JobType } from "../types/job";
import { todayInDhaka } from "./today";

export type JobQuery = {
  search: string;
  location: string; // "" = any
  jobType: JobType | null;
  category: JobCategory | null;
  sort: JobSort;
};

// Columns we send to the frontend (no internal timestamps).
export const jobColumns = {
  id: jobs.id,
  title: jobs.title,
  company: jobs.company,
  location: jobs.location,
  jobType: jobs.jobType,
  category: jobs.category,
  salaryMin: jobs.salaryMin,
  salaryMax: jobs.salaryMax,
  description: jobs.description,
  applyUrl: jobs.applyUrl,
  deadline: jobs.deadline,
  status: jobs.status,
  isDemo: jobs.isDemo,
};

// Same columns plus "have I saved this, and what's its status?" (null = not saved).
const jobWithSavedColumns = { ...jobColumns, savedStatus: savedJobs.status };

// LEFT JOIN: keep every job, and attach my saved row if there is one.
const mySavedRow = (userId: number) => and(eq(savedJobs.jobId, jobs.id), eq(savedJobs.userId, userId));

// % and _ are wildcards in LIKE; escape them so a user typing "50%" searches literally.
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function findJobs(query: JobQuery, userId: number): Promise<Job[]> {
  const conditions: SQL[] = [
    eq(jobs.status, "open"),
    // hide jobs whose deadline has already passed (in Bangladesh time)
    or(isNull(jobs.deadline), gte(jobs.deadline, todayInDhaka))!,
  ];

  const needle = query.search.trim();
  if (needle) {
    const pattern = `%${escapeLike(needle)}%`;
    conditions.push(or(ilike(jobs.title, pattern), ilike(jobs.company, pattern))!);
  }
  if (query.location) conditions.push(eq(jobs.location, query.location));
  if (query.jobType) conditions.push(eq(jobs.jobType, query.jobType));
  if (query.category) conditions.push(eq(jobs.category, query.category));

  const orderBy = {
    newest: [desc(jobs.createdAt), desc(jobs.id)],
    // best-match is sorted in the route after scoring; start from newest so ties stay newest-first
    "best-match": [desc(jobs.createdAt), desc(jobs.id)],
    deadline: [sql`${jobs.deadline} ASC NULLS LAST`, asc(jobs.id)],
    "salary-high": [sql`${jobs.salaryMax} DESC NULLS LAST`, asc(jobs.id)],
    "salary-low": [sql`${jobs.salaryMin} ASC NULLS LAST`, asc(jobs.id)],
  }[query.sort];

  return db
    .select(jobWithSavedColumns)
    .from(jobs)
    .leftJoin(savedJobs, mySavedRow(userId))
    .where(and(...conditions))
    .orderBy(...orderBy);
}

export async function findJobById(id: number, userId: number): Promise<Job | undefined> {
  const rows = await db
    .select(jobWithSavedColumns)
    .from(jobs)
    .leftJoin(savedJobs, mySavedRow(userId))
    .where(eq(jobs.id, id))
    .limit(1);
  return rows[0];
}

// Distinct locations of open jobs, for the filter dropdown.
export async function findLocations(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ location: jobs.location })
    .from(jobs)
    .where(eq(jobs.status, "open"))
    .orderBy(asc(jobs.location));
  return rows.map((r) => r.location);
}

// RAG retrieval: the open jobs whose meaning is closest to this vector (e.g. a question), best first.
export async function findJobsBySimilarity(vector: number[], userId: number, limit: number): Promise<Job[]> {
  const literal = JSON.stringify(vector);
  return db
    .select(jobWithSavedColumns)
    .from(jobs)
    .leftJoin(savedJobs, mySavedRow(userId))
    .where(
      and(
        eq(jobs.status, "open"),
        or(isNull(jobs.deadline), gte(jobs.deadline, todayInDhaka)),
        sql`${jobs.embedding} IS NOT NULL`
      )
    )
    .orderBy(sql`${jobs.embedding} <=> ${literal}::vector`)
    .limit(limit);
}
