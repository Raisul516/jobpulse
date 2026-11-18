// Automatic job sources (company career pages on supported platforms).
//   GET   /api/sources                                  -> list sources with their last run
//   POST  /api/sources  { url, category, name? }        -> add a company from its careers link, then collect
//   POST  /api/sources/:id/run                          -> collect now
//   PATCH /api/sources/:id  { enabled?, defaultCategory? }
import { Router } from "express";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { jobSourceRecords, jobSources } from "../db/schema";
import { COLLECTORS, detectPlatform } from "../collectors";
import { CollectorError } from "../collectors/http";
import { bdjobsList } from "../collectors/bdjobs";
import { runSource } from "../collectors/run";
import { CollectedJob, isSeen } from "../collectors/types";
import { JOB_CATEGORIES } from "../types/job";

export const sourcesRouter = Router();

const sourceColumns = {
  id: jobSources.id,
  name: jobSources.name,
  adapter: jobSources.adapter,
  externalKey: jobSources.externalKey,
  baseUrl: jobSources.baseUrl,
  defaultCategory: jobSources.defaultCategory,
  enabled: jobSources.enabled,
  lastRunAt: jobSources.lastRunAt,
  lastRunOk: jobSources.lastRunOk,
  lastRunMessage: jobSources.lastRunMessage,
  lastFoundCount: jobSources.lastFoundCount,
  // how many of this source's postings are live right now
  // (table name written out in full: inside a subquery a bare "id" would mean the inner table's id)
  activeCount: sql<number>`(SELECT count(*)::int FROM ${jobSourceRecords} r WHERE r.source_id = "job_sources"."id" AND r.removed_at IS NULL)`,
};

const addSchema = z.object({
  url: z.string().trim().max(2000).url("Please paste the full careers-page link"),
  category: z.enum(JOB_CATEGORIES),
  name: z.string().trim().max(100).optional(),
});

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  defaultCategory: z.enum(JOB_CATEGORIES).optional(),
});

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validationError(error: z.ZodError) {
  return {
    error: "Please check the highlighted fields",
    fields: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}

sourcesRouter.get("/", async (_req, res) => {
  const sources = await db
    .select(sourceColumns)
    .from(jobSources)
    .where(ne(jobSources.adapter, "manual"))
    .orderBy(desc(jobSources.createdAt));
  res.json({ sources, platforms: Object.values(COLLECTORS).map((c) => c.label) });
});

// GET /api/sources/bdjobs/categories -> bdjobs' job categories, for the picker on the Sources page
sourcesRouter.get("/bdjobs/categories", async (_req, res) => {
  try {
    const { categories, items } = await bdjobsList();
    const newest = new Map<number, number>();
    for (const item of items) newest.set(Number(item.Cat_id), (newest.get(Number(item.Cat_id)) ?? 0) + 1);
    // how many of the 50 newest jobs are in each category, as a hint of how busy it is
    res.json({ categories: categories.map((c) => ({ ...c, newestCount: newest.get(c.id) ?? 0 })) });
  } catch (err) {
    if (err instanceof CollectorError) {
      res.status(502).json({ error: err.message });
      return;
    }
    throw err;
  }
});

sourcesRouter.post("/", async (req, res) => {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error));
    return;
  }

  const platform = detectPlatform(parsed.data.url);
  if (!platform) {
    res.status(400).json({
      error: `JobPulse can't read this careers page automatically yet. Supported: ${Object.values(COLLECTORS)
        .map((c) => c.label)
        .join(", ")}. You can still add single jobs with "Add from link".`,
    });
    return;
  }

  const [already] = await db
    .select(sourceColumns)
    .from(jobSources)
    .where(and(eq(jobSources.adapter, platform.adapter), eq(jobSources.externalKey, platform.key)));
  if (already) {
    res.status(409).json({ error: `This company is already in your sources ("${already.name}").`, source: already });
    return;
  }

  // Check the source really works before saving it (and learn a name for it).
  let previewCount: number;
  let name: string;
  try {
    if (platform.adapter === "bdjobs") {
      // Only the list page: a full test run would download up to 25 job pages for nothing.
      const { items, categories } = await bdjobsList();
      const ids = platform.key === "all" ? null : platform.key.split(",").map(Number);
      previewCount = ids ? items.filter((i) => ids.includes(Number(i.Cat_id))).length : items.length;
      const names = ids ? categories.filter((c) => ids.includes(c.id)).map((c) => c.name) : ["all categories"];
      name = parsed.data.name || names.join(", ") || platform.key;
    } else {
      const preview = (await COLLECTORS[platform.adapter].fetchJobs(platform.key, new Set())).filter(
        (j): j is CollectedJob => !isSeen(j)
      );
      previewCount = preview.length;
      name = parsed.data.name || preview.find((j) => j.company)?.company || platform.key;
    }
  } catch (err) {
    if (err instanceof CollectorError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  const [created] = await db
    .insert(jobSources)
    .values({
      name: `${name} (${COLLECTORS[platform.adapter].label})`,
      kind: platform.adapter === "bdjobs" ? "portal" : "company",
      adapter: platform.adapter,
      externalKey: platform.key,
      baseUrl: parsed.data.url,
      defaultCategory: parsed.data.category,
    })
    .onConflictDoNothing()
    .returning({ id: jobSources.id });
  if (!created) {
    res.status(409).json({ error: "A source with this name already exists." });
    return;
  }

  const summary = await runSource(created.id);
  const [source] = await db.select(sourceColumns).from(jobSources).where(eq(jobSources.id, created.id));
  // Some platforms answer "0 jobs" even for a company ID that does not exist, so we can only warn.
  const warning =
    previewCount === 0
      ? "No open jobs found right now. If you expected some, check that the link is the company's careers page."
      : undefined;
  res.status(201).json({ source, summary, warning });
});

sourcesRouter.post("/:id/run", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid source id" });
    return;
  }
  const [exists] = await db.select({ adapter: jobSources.adapter }).from(jobSources).where(eq(jobSources.id, id));
  if (!exists || exists.adapter === "manual") {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  const summary = await runSource(id);
  const [source] = await db.select(sourceColumns).from(jobSources).where(eq(jobSources.id, id));
  res.json({ source, summary });
});

sourcesRouter.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid source id" });
    return;
  }
  const parsed = patchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error));
    return;
  }
  const [source] = await db
    .update(jobSources)
    .set(parsed.data)
    .where(and(eq(jobSources.id, id), ne(jobSources.adapter, "manual")))
    .returning({ id: jobSources.id });
  if (!source) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  const [updated] = await db.select(sourceColumns).from(jobSources).where(eq(jobSources.id, id));
  res.json({ source: updated });
});
