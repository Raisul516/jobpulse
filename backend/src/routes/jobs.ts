import { Router } from "express";
import { currentUserId } from "../lib/currentUser";
import { findPossibleDuplicates } from "../lib/importQueries";
import { findJobById, findJobs, findLocations } from "../lib/jobQueries";
import { similarities } from "../lib/jobEmbeddings";
import { matchJob, Preferences } from "../lib/matching";
import { getPreferences } from "../lib/preferences";
import { getProfileForMatching } from "../lib/profile";
import { JOB_CATEGORIES, JOB_TYPES, JobCategory, JobSort, JobType, SORTS } from "../types/job";

// Used when you uploaded a CV but haven't set preferences: no filters, default threshold.
const DEFAULT_PREFERENCES: Preferences = {
  keywords: [],
  excludeKeywords: [],
  categories: [],
  jobTypes: [],
  locations: [],
  minSalary: null,
  matchThreshold: 70,
};

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

  // Add "how well does this match me?" to every job — from your preferences and/or your confirmed CV.
  // (null when you have set neither)
  const [savedPrefs, profile] = await Promise.all([getPreferences(userId), getProfileForMatching(userId)]);
  const prefs = savedPrefs ?? (profile ? DEFAULT_PREFERENCES : null);
  const similarity = profile?.embedding ? await similarities(profile.embedding, jobs.map((j) => j.id)) : new Map<number, number>();

  let result = jobs.map((job) => ({
    ...job,
    match: prefs
      ? matchJob(job, prefs, profile ? { skills: profile.skills, similarity: similarity.get(job.id) ?? null } : undefined)
      : null,
  }));

  if (firstString(req.query.matchesOnly) === "true" && prefs) {
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

  res.json({ jobs: result, count: result.length, hasPreferences: prefs !== null, hasCvProfile: profile !== null });
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

  const job = await findJobById(id, await currentUserId());
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json({ job });
});
