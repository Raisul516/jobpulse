import { and, asc, desc, eq, gte, ilike, isNull, or, sql, SQL } from "drizzle-orm";
import { db } from "../db/client";
import { jobs } from "../db/schema";
import { Job, JobCategory, JobSort, JobType } from "../types/job";

export type JobQuery = {
  search: string;
  location: string; // "" = any
  jobType: JobType | null;
  category: JobCategory | null;
  sort: JobSort;
};

// Columns we send to the frontend (no internal timestamps).
const jobColumns = {
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

// % and _ are wildcards in LIKE; escape them so a user typing "50%" searches literally.
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function findJobs(query: JobQuery): Promise<Job[]> {
  const conditions: SQL[] = [
    eq(jobs.status, "open"),
    // hide jobs whose deadline has already passed
    or(isNull(jobs.deadline), gte(jobs.deadline, sql`CURRENT_DATE`))!,
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
    deadline: [sql`${jobs.deadline} ASC NULLS LAST`, asc(jobs.id)],
    "salary-high": [sql`${jobs.salaryMax} DESC NULLS LAST`, asc(jobs.id)],
    "salary-low": [sql`${jobs.salaryMin} ASC NULLS LAST`, asc(jobs.id)],
  }[query.sort];

  return db
    .select(jobColumns)
    .from(jobs)
    .where(and(...conditions))
    .orderBy(...orderBy);
}

export async function findJobById(id: number): Promise<Job | undefined> {
  const rows = await db.select(jobColumns).from(jobs).where(eq(jobs.id, id)).limit(1);
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
