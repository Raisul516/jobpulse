// Must match the backend's Job type (backend/src/types/job.ts).
export type JobType = "Full-time" | "Part-time" | "Internship" | "Contract";
export type JobCategory = "Government" | "Private" | "Bank" | "NGO" | "Internship";

export type Job = {
  id: number;
  title: string;
  company: string;
  location: string;
  jobType: JobType;
  category: JobCategory;
  salaryMin: number | null; // BDT per month; null = not stated
  salaryMax: number | null;
  description: string | null;
  applyUrl: string | null;
  deadline: string | null; // "YYYY-MM-DD"
  status: "open" | "expired" | "closed";
  isDemo: boolean;
  savedStatus: "saved" | "applied" | "interview" | "offer" | "rejected" | null; // null = not saved
};
