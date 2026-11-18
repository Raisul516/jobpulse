import { asc, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { db } from "../db/client";
import { jobSourceRecords, jobSources } from "../db/schema";
import { extractRequirements } from "../lib/eligibility";
import { currentUserId } from "../lib/currentUser";
import { findPossibleDuplicates } from "../lib/importQueries";
import { findJobById, findJobs, findLocations } from "../lib/jobQueries";
import { addMatches } from "../lib/matchForUser";
import { JOB_CATEGORIES, JOB_TYPES, JobCategory, JobSort, JobType, SORTS } from "../types/job";

export const jobsRouter = Router();

// Query params can arrive as a string, an array, or be missing. Always get one string.
function firstString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

// "All" or empty means "no filter".
function optional(value: unknown): string {
  const text = firstString(value).trim();
  return text === "All" ? "" : text;
}

// GET /api/jobs?search=&location=&jobType=&category=&sort=&matchesOnly=true
jobsRouter.get("/", async (req, res) => {
  const jobType = optional(req.query.jobType);
  const category = optional(req.query.category);
  const sort = optional(req.query.sort) || "newest";

  if (jobType && !JOB_TYPES.includes(jobType as JobType)) {
    res.status(400).json({ error: "Invalid jobType" });
    return;
  }
  if (category && !JOB_CATEGORIES.includes(category as JobCategory)) {
    res.status(400).json({ error: "Invalid category" });
    return;
  }
  if (!SORTS.includes(sort as JobSort)) {
    res.status(400).json({ error: "Invalid sort" });
    return;
  }

  const userId = await currentUserId();
  const jobs = await findJobs(
    {
      search: firstString(req.query.search),
      location: optional(req.query.location),
      jobType: (jobType || null) as JobType | null,
      category: (category || null) as JobCategory | null,
      sort: sort as JobSort,
    },
    userId
  );

  // Add "how well does this match me?" to every job (see lib/matchForUser.ts)
  const matched = await addMatches(userId, jobs);
  let result = matched.jobs;

  if (firstString(req.query.matchesOnly) === "true" && matched.hasPreferences) {
    result = result.filter((job) => job.match?.isMatch);
  }
  if (sort === "best-match") {
    // matches first, then higher score; ties keep the newest-first order from the database
    result.sort(
      (a, b) =>
        Number(b.match?.isMatch ?? 0) - Number(a.match?.isMatch ?? 0) ||
        Number(b.match?.passesFilters ?? 0) - Number(a.match?.passesFilters ?? 0) ||
        (b.match?.score ?? 0) - (a.match?.score ?? 0)
    );
  }

  res.json({ jobs: result, count: result.length, hasPreferences: matched.hasPreferences, hasCvProfile: matched.hasCvProfile });
});

// GET /api/jobs/locations — must be above "/:id", otherwise "locations" is read as an id.
jobsRouter.get("/locations", async (_req, res) => {
  res.json({ locations: await findLocations() });
});

// GET /api/jobs/similar?title=&company= — open jobs that might be the same vacancy.
jobsRouter.get("/similar", async (req, res) => {
  const title = firstString(req.query.title).trim().slice(0, 200);
  const company = firstString(req.query.company).trim().slice(0, 200);
  res.json({ jobs: await findPossibleDuplicates(title, company) });
});

// GET /api/jobs/:id
jobsRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid job id" });
    return;
  }

  const userId = await currentUserId();
  const job = await findJobById(id, userId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  // Same match + eligibility as the job list, plus what the detail page needs:
  // the requirements JobPulse read from the text, and every site this vacancy was found on.
  const [withMatch] = (await addMatches(userId, [job])).jobs;
  const requirements = extractRequirements(`${job.title}\n${job.description ?? ""}`);
  const sources = await db
    .select({
      name: jobSources.name,
      adapter: jobSources.adapter,
      url: jobSourceRecords.sourceUrl,
      firstSeen: jobSourceRecords.fetchedAt,
      lastSeen: jobSourceRecords.lastSeenAt,
      removed: sql<boolean>`${jobSourceRecords.removedAt} IS NOT NULL`,
    })
    .from(jobSourceRecords)
    .innerJoin(jobSources, eq(jobSources.id, jobSourceRecords.sourceId))
    .where(eq(jobSourceRecords.jobId, id))
    .orderBy(asc(jobSourceRecords.fetchedAt));

  res.json({ job: withMatch, requirements, sources });
});
