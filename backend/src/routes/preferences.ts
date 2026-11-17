// GET /api/preferences   -> my preferences (null if not set yet)
// PUT /api/preferences   -> save them
import { Router } from "express";
import { z } from "zod";
import { currentUserId } from "../lib/currentUser";
import { getPreferences, savePreferences } from "../lib/preferences";
import { JOB_CATEGORIES, JOB_TYPES } from "../types/job";

export const preferencesRouter = Router();

// A list of short words/phrases: trimmed, no empties, no duplicates (ignoring capital letters).
const wordList = z
  .array(z.string().trim().max(60, "Each keyword can be at most 60 characters"))
  .max(50, "At most 50 keywords")
  .transform((list) => {
    const seen = new Set<string>();
    return list.filter((w) => {
      const key = w.toLowerCase();
      if (!w || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

const schema = z.object({
  keywords: wordList,
  excludeKeywords: wordList,
  categories: z.array(z.enum(JOB_CATEGORIES)).transform((l) => [...new Set(l)]),
  jobTypes: z.array(z.enum(JOB_TYPES)).transform((l) => [...new Set(l)]),
  locations: wordList,
  minSalary: z.number().int().min(0).max(10_000_000).nullable(),
  matchThreshold: z.number().int().min(0).max(100),
  notifyEnabled: z.boolean(),
});

preferencesRouter.get("/", async (_req, res) => {
  res.json({ preferences: await getPreferences(await currentUserId()) });
});

preferencesRouter.put("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Please check the highlighted fields",
      fields: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }
  res.json({ preferences: await savePreferences(await currentUserId(), parsed.data) });
});
