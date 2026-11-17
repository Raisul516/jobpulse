import { jobCategoryEnum, jobTypeEnum } from "../db/schema";

// Allowed values come straight from the database enums, so they can't drift apart.
export const JOB_TYPES = jobTypeEnum.enumValues;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_CATEGORIES = jobCategoryEnum.enumValues;
export type JobCategory = (typeof JOB_CATEGORIES)[number];

export const SORTS = ["newest", "deadline", "salary-high", "salary-low"] as const;
export type JobSort = (typeof SORTS)[number];

// The shape the API sends to the frontend.
export type Job = {
  id: number;
  title: string;
  company: string;
  location: string;
  jobType: JobType;
  category: JobCategory;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string | null;
  applyUrl: string | null;
  deadline: string | null; // "YYYY-MM-DD"
  status: "open" | "expired" | "closed";
  isDemo: boolean;
};
