// Talks to the Python ai-service (CV reading + embeddings). It runs on this computer only.
import { EMBEDDING_DIMENSIONS } from "../db/schema";

const BASE_URL = process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8000";
// When the ai-service runs on the internet (deployed), both sides share this secret so nobody else can use it.
const TOKEN = process.env.AI_SERVICE_TOKEN ?? "";

export class AiServiceError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    if (TOKEN) headers.set("Authorization", `Bearer ${TOKEN}`);
    response = await fetch(`${BASE_URL}${path}`, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new AiServiceError("The AI service is not running. Start it (see README) and try again.", 503);
  }
  const body = (await response.json().catch(() => ({}))) as { detail?: unknown };
  if (!response.ok) {
    // FastAPI puts its message in "detail"
    const detail = typeof body.detail === "string" ? body.detail : "The AI service could not handle this request.";
    // 429 = free LLM limit reached, 503 = LLM not set up: pass those on; other server errors -> 502
    const status = response.status === 429 || response.status === 503 ? response.status : response.status >= 500 ? 502 : 400;
    throw new AiServiceError(detail, status);
  }
  return body as T;
}

export type ParsedCv = {
  text: string;
  fields: Record<string, { value: unknown; foundBy: string }>;
  warnings: string[];
};

export function parseCv(fileName: string, data: Buffer, mimeType: string): Promise<ParsedCv> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(data)], { type: mimeType }), fileName);
  return call<ParsedCv>("/parse-cv", { method: "POST", body: form }, 60_000);
}

// Up to 64 texts per call. Returns one 384-number vector per text.
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const body = await call<{ vectors: number[][]; dimensions: number }>(
    "/embed",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texts }) },
    // the first call loads the model, which takes a few seconds
    120_000
  );
  if (body.dimensions !== EMBEDDING_DIMENSIONS) {
    throw new AiServiceError(`AI service sends ${body.dimensions}-number vectors, but the database expects ${EMBEDDING_DIMENSIONS}.`);
  }
  return body.vectors;
}

export async function aiServiceIsUp(): Promise<boolean> {
  try {
    await call("/health", { method: "GET" }, 3_000);
    return true;
  } catch {
    return false;
  }
}

// ---------- RAG (the AI service asks the LLM; these need LLM_API_KEY there) ----------

export type LlmProfile = {
  skills: string[];
  experienceYears: number | null;
  education: unknown[];
  summary: string | null;
} | null;

export function explainMatch(job: object, profile: LlmProfile, match: object | null): Promise<{ text: string; model: string }> {
  return call("/explain-match", jsonPost({ job, profile, match }), 90_000);
}

export function askAboutJobs(
  question: string,
  jobs: object[],
  profile: LlmProfile
): Promise<{ answer: string; jobIds: number[]; model: string }> {
  return call("/ask", jsonPost({ question, jobs, profile }), 90_000);
}

function jsonPost(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export type CoverLetterOptions = { language: "en" | "bn"; tone: "formal" | "friendly"; notes: string };

export function coverLetter(
  job: object,
  profile: LlmProfile,
  options: CoverLetterOptions
): Promise<{ text: string; model: string; namePlaceholder: string }> {
  return call("/cover-letter", jsonPost({ job, profile, ...options }), 90_000);
}
