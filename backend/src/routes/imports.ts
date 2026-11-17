// "Paste a link" API.
//   POST /api/imports               { url }          -> fetch + parse, store as a pending draft
//   GET  /api/imports?status=pending                 -> list drafts
//   GET  /api/imports/:id                            -> one draft + possible duplicates
//   POST /api/imports/:id/approve   { job } | { linkToJobId }
//   POST /api/imports/:id/reject
import { Router, Response } from "express";
import { z } from "zod";
import {
  approveImport,
  createImport,
  findImportById,
  findImports,
  findPossibleDuplicates,
  ImportNotFoundError,
  ImportRecord,
  ImportStateError,
  rejectImport,
} from "../lib/importQueries";
import { JOB_CATEGORIES, JOB_TYPES } from "../types/job";

export const importsRouter = Router();

// ---------- request shapes (zod checks the data before we touch the database) ----------

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .url("Please enter a full link starting with http:// or https://")
  .refine((value) => /^https?:\/\//i.test(value), "Only http and https links are supported");

const createSchema = z.object({ url: httpUrl });

const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => v || null);

const salary = z.number().int().min(0).max(10_000_000).nullish().transform((v) => v ?? null);

const jobSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    company: z.string().trim().min(1, "Company is required").max(200),
    location: z.string().trim().min(1, "Location is required").max(100),
    jobType: z.enum(JOB_TYPES),
    category: z.enum(JOB_CATEGORIES),
    salaryMin: salary,
    salaryMax: salary,
    deadline: z.iso.date("Deadline must be a date (YYYY-MM-DD)").nullish().transform((v) => v ?? null),
    applyUrl: httpUrl.nullish().or(z.literal("")).transform((v) => v || null),
    description: optionalText(5000),
  })
  .refine((j) => j.salaryMin === null || j.salaryMax === null || j.salaryMin <= j.salaryMax, {
    message: "Minimum salary can't be bigger than maximum salary",
    path: ["salaryMin"],
  });

const approveSchema = z.union([
  z.object({ linkToJobId: z.number().int().positive() }),
  z.object({ job: jobSchema }),
]);

const statusSchema = z.enum(["pending", "approved", "rejected"]).optional();

// ---------- helpers ----------

function sendValidationError(res: Response, error: z.ZodError) {
  res.status(400).json({
    error: "Please check the highlighted fields",
    fields: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  });
}

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function withDuplicates(record: ImportRecord) {
  const possibleDuplicates =
    record.reviewStatus === "pending"
      ? await findPossibleDuplicates(record.extracted?.title?.value, record.extracted?.company?.value)
      : [];
  return { ...record, possibleDuplicates };
}

// ---------- routes ----------

importsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);

  const { record, alreadyExisted } = await createImport(parsed.data.url);
  res.status(alreadyExisted ? 200 : 201).json({ import: await withDuplicates(record), alreadyExisted });
});

importsRouter.get("/", async (req, res) => {
  const status = statusSchema.safeParse(req.query.status || undefined);
  if (!status.success) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  res.json({ imports: await findImports(status.data) });
});

importsRouter.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid import id" });
    return;
  }
  const record = await findImportById(id);
  if (!record) {
    res.status(404).json({ error: "Import not found" });
    return;
  }
  res.json({ import: await withDuplicates(record) });
});

importsRouter.post("/:id/approve", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid import id" });
    return;
  }
  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);

  try {
    const result = await approveImport(id, parsed.data);
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
    if (err instanceof ImportNotFoundError) {
      res.status(404).json({ error: "Import not found" });
      return;
    }
    if (err instanceof ImportStateError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

importsRouter.post("/:id/reject", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid import id" });
    return;
  }
  try {
    await rejectImport(id);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ImportNotFoundError) {
      res.status(404).json({ error: "Import not found" });
      return;
    }
    if (err instanceof ImportStateError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});
