// Your profile from your CV.
//   GET    /api/profile        -> confirmed profile + latest CV draft
//   POST   /api/profile/cv     -> upload a CV (PDF/DOCX, max 5 MB); returns a DRAFT to review
//   PUT    /api/profile        -> save the profile you checked
//   DELETE /api/profile        -> delete your profile and all uploaded CV text
import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { z } from "zod";
import { aiServiceIsUp, AiServiceError, parseCv } from "../lib/aiService";
import { currentUserId } from "../lib/currentUser";
import { confirmProfile, deleteProfile, getLatestUpload, getProfile, saveUpload } from "../lib/profile";

export const profileRouter = Router();

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = /\.(pdf|docx)$/i;

// Keep the upload in memory: it's passed straight to the AI service, never saved as a file.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, done) => done(null, ALLOWED.test(file.originalname)),
});

function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("cv")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "The CV file is larger than 5 MB." : "Upload failed." });
      return;
    }
    if (err) return next(err);
    next();
  });
}

const educationSchema = z.object({
  level: z.enum(["PhD", "Masters", "Bachelor", "Diploma", "HSC", "SSC"]),
  degree: z.string().trim().min(1).max(150),
  subject: z.string().trim().max(100).nullable(),
  institution: z.string().trim().max(150).nullable(),
  result: z.string().trim().max(50).nullable(),
  year: z.number().int().min(1950).max(2100).nullable(),
});

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().transform((v) => v || null);

const profileSchema = z.object({
  fullName: optionalText(100),
  dateOfBirth: z.iso.date("Date of birth must be a date").nullable(),
  skills: z
    .array(z.string().trim().min(1).max(60))
    .max(100)
    .transform((list) => [...new Map(list.map((s) => [s.toLowerCase(), s])).values()]),
  education: z.array(educationSchema).max(10),
  experienceYears: z.number().min(0).max(60).nullable(),
  summary: optionalText(1000),
  cvUploadId: z.number().int().positive().nullable(),
});

profileRouter.get("/", async (_req, res) => {
  const userId = await currentUserId();
  const [profile, latestUpload, aiServiceUp] = await Promise.all([
    getProfile(userId),
    getLatestUpload(userId),
    aiServiceIsUp(),
  ]);
  res.json({ profile, latestUpload, aiServiceUp });
});

profileRouter.post("/cv", handleUpload, async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Please choose your CV as a PDF or .docx file." });
    return;
  }
  try {
    const parsed = await parseCv(req.file.originalname, req.file.buffer, req.file.mimetype);
    const saved = await saveUpload(await currentUserId(), req.file.originalname, parsed);
    res.status(201).json({ upload: saved });
  } catch (err) {
    if (err instanceof AiServiceError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

profileRouter.put("/", async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Please check the highlighted fields",
      fields: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }
  res.json(await confirmProfile(await currentUserId(), parsed.data));
});

profileRouter.delete("/", async (_req, res) => {
  await deleteProfile(await currentUserId());
  res.status(204).end();
});
