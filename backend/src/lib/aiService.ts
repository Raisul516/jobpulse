// Talks to the Python ai-service (CV reading + embeddings). It runs on this computer only.
import { EMBEDDING_DIMENSIONS } from "../db/schema";

const BASE_URL = process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8000";

export class AiServiceError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new AiServiceError("The AI service is not running. Start it (see README) and try again.", 503);
  }
  const body = (await response.json().catch(() => ({}))) as { detail?: unknown };
  if (!response.ok) {
    // FastAPI puts its message in "detail"
    const detail = typeof body.detail === "string" ? body.detail : "The AI service could not handle this request.";
    throw new AiServiceError(detail, response.status >= 500 ? 502 : 400);
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
