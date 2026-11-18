// Possible duplicate jobs — the user decides; nothing is merged automatically.
//   GET  /api/duplicates                      -> suggested pairs with reasons
//   POST /api/duplicates/merge   { keepId, mergeId }
//   POST /api/duplicates/dismiss { jobId1, jobId2 }   ("not the same")
import { Router } from "express";
import { z } from "zod";
import { dismissPair, DuplicateError, findDuplicatePairs, mergeJobs } from "../lib/duplicates";

export const duplicatesRouter = Router();

const id = z.number().int().positive();
const mergeSchema = z.object({ keepId: id, mergeId: id });
const dismissSchema = z.object({ jobId1: id, jobId2: id });

duplicatesRouter.get("/", async (_req, res) => {
  const pairs = await findDuplicatePairs();
  res.json({ pairs, count: pairs.length });
});

duplicatesRouter.post("/merge", async (req, res) => {
  const parsed = mergeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "keepId and mergeId must be job ids" });
    return;
  }
  try {
    await mergeJobs(parsed.data.keepId, parsed.data.mergeId);
    res.json({ ok: true, keptId: parsed.data.keepId });
  } catch (err) {
    if (err instanceof DuplicateError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

duplicatesRouter.post("/dismiss", async (req, res) => {
  const parsed = dismissSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "jobId1 and jobId2 must be job ids" });
    return;
  }
  try {
    await dismissPair(parsed.data.jobId1, parsed.data.jobId2);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof DuplicateError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});
