import { Router } from "express";
import { findJobById, findJobs, findLocations } from "../lib/jobQueries";
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

// GET /api/jobs?search=&location=&jobType=&category=&sort=
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

  const jobs = await findJobs({
    search: firstString(req.query.search),
    location: optional(req.query.location),
    jobType: (jobType || null) as JobType | null,
    category: (category || null) as JobCategory | null,
    sort: sort as JobSort,
  });

  res.json({ jobs, count: jobs.length });
});

// GET /api/jobs/locations — must be above "/:id", otherwise "locations" is read as an id.
jobsRouter.get("/locations", async (_req, res) => {
  res.json({ locations: await findLocations() });
});

// GET /api/jobs/:id
jobsRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid job id" });
    return;
  }

  const job = await findJobById(id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json({ job });
});
