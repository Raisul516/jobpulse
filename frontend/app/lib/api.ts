// Everything the frontend needs to talk to the backend API.
import { JobCategory, JobType } from "../types/job";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type FoundBy = "structured" | "meta" | "text";
type Field<T> = { value: T; foundBy: FoundBy };

export type ExtractedJob = {
  title?: Field<string>;
  company?: Field<string>;
  location?: Field<string>;
  jobType?: Field<JobType>;
  category?: Field<JobCategory>;
  salaryMin?: Field<number>;
  salaryMax?: Field<number>;
  deadline?: Field<string>;
  applyUrl?: Field<string>;
  description?: Field<string>;
};

export type PossibleDuplicate = {
  id: number;
  title: string;
  company: string;
  deadline: string | null;
  reason: string;
};

export type JobImport = {
  id: number;
  sourceUrl: string;
  jobId: number | null;
  extracted: ExtractedJob | null;
  fetchError: string | null;
  reviewReason: string | null; // why an automatically collected job needs your review
  reviewStatus: "pending" | "approved" | "rejected";
  fetchedAt: string;
  possibleDuplicates?: PossibleDuplicate[];
};

export type FieldError = { path: string; message: string };

// Error from the API, with per-field messages when the server sent them.
export class ApiError extends Error {
  constructor(message: string, public fields: FieldError[] = []) {
    super(message);
  }
}

// fetch + JSON + turn error responses into ApiError.
export async function api<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("Could not reach the JobPulse server. Is the backend running?");
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(body.error ?? `Request failed (${response.status})`, body.fields ?? []);
  }
  return body as T;
}
