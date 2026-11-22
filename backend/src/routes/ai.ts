// AI writing features (RAG). The text is written by an LLM from JobPulse's own data.
//   POST /api/ai/explain/:jobId   -> { text, model, cached }
//   POST /api/ai/ask { question } -> { answer, model, recommended, jobs }
import { Router } from "express";
import { z } from "zod";
import { AiServiceError } from "../lib/aiService";
import { currentUserId } from "../lib/currentUser";
import { askJobPulse, explainJob } from "../lib/rag";

export const aiRouter = Router();

function sendAiError(res: import("express").Response, err: unknown): void {
  if (err instanceof AiServiceError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  throw err;
}

aiRouter.post("/explain/:jobId", async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    res.status(400).json({ error: "Invalid job id" });
    return;
  }
  try {
    const result = await explainJob(await currentUserId(), jobId);
    if (!result) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(result);
  } catch (err) {
    sendAiError(res, err);
  }
});

const askSchema = z.object({ question: z.string().trim().min(3, "Type a question.").max(500, "Keep the question under 500 characters.") });

aiRouter.post("/ask", async (req, res) => {
  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid question" });
    return;
  }
  try {
    res.json(await askJobPulse(await currentUserId(), parsed.data.question));
  } catch (err) {
    sendAiError(res, err);
  }
});
