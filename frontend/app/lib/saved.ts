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
  // badge colours from app/globals.css (they include dark-mode variants)
  saved: "badge-gray",
  applied: "badge-blue",
  interview: "badge-purple",
  offer: "badge-green",
  rejected: "badge-red",
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
