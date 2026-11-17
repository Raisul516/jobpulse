// Saved jobs / application tracking: shared labels and API calls.
import { Job } from "../types/job";
import { api } from "./api";

export const APPLICATION_STATUSES = ["saved", "applied", "interview", "offer", "rejected"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved — not applied yet",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

export const STATUS_COLORS: Record<ApplicationStatus, string> = {
  saved: "bg-gray-100 text-gray-800",
  applied: "bg-blue-100 text-blue-800",
  interview: "bg-purple-100 text-purple-800",
  offer: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export type SavedJob = {
  job: Job;
  status: ApplicationStatus;
  notes: string | null;
  appliedAt: string | null;
  savedAt: string;
  updatedAt: string;
};

export function saveJob(jobId: number, changes: { status?: ApplicationStatus; notes?: string | null } = {}) {
  return api<{ saved: unknown }>(`/api/saved/${jobId}`, { method: "PUT", body: changes });
}

export function unsaveJob(jobId: number) {
  return api<void>(`/api/saved/${jobId}`, { method: "DELETE" });
}
