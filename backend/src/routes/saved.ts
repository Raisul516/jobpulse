// Saved jobs / application tracker API.
//   GET    /api/saved                      -> my saved jobs (nearest deadline first)
//   PUT    /api/saved/:jobId  { status?, notes? }  -> save, or update status/notes
//   DELETE /api/saved/:jobId                -> remove from saved
import { Router } from "express";
import { z } from "zod";
import { currentUserId } from "../lib/currentUser";
import { APPLICATION_STATUSES, findSavedJobs, JobNotFoundError, saveJob, unsaveJob } from "../lib/savedQueries";

export const savedRouter = Router();

const updateSchema = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
  notes: z
    .string()
    .max(2000, "Notes can be at most 2000 characters")
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v?.trim() || null)),
});

function parseJobId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

savedRouter.get("/", async (_req, res) => {
  const saved = await findSavedJobs(await currentUserId());
  res.json({ saved, count: saved.length });
});

savedRouter.put("/:jobId", async (req, res) => {
  const jobId = parseJobId(req.params.jobId);
  if (!jobId) {
    res.status(400).json({ error: "Invalid job id" });
    return;
  }
  const parsed = updateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      error: "Please check the highlighted fields",
      fields: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }

  try {
    const saved = await saveJob(await currentUserId(), jobId, parsed.data);
    res.json({ saved });
  } catch (err) {
    if (err instanceof JobNotFoundError) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    throw err;
  }
});

savedRouter.delete("/:jobId", async (req, res) => {
  const jobId = parseJobId(req.params.jobId);
  if (!jobId) {
    res.status(400).json({ error: "Invalid job id" });
    return;
  }
  const removed = await unsaveJob(await currentUserId(), jobId);
  if (!removed) {
    res.status(404).json({ error: "This job is not saved" });
    return;
  }
  res.status(204).end();
});
