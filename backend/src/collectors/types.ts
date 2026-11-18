// What every collector (one per recruitment platform) returns for each open job.
// The collector only copies what the platform says; turning it into a JobPulse job
// (location names, deadline, salary, category...) happens in run.ts, the same way for all platforms.
export type CollectedJob = {
  externalId: string; // the platform's own ID for this posting
  url: string; // public page of the posting
  applyUrl?: string;
  title: string;
  company: string;
  locationText?: string; // as written by the platform, e.g. "Dhaka, Bangladesh"
  remote?: boolean;
  jobTypeText?: string; // e.g. "Full-time", "permanent", "Intern"
  descriptionText: string; // plain text, used to find deadline and salary
  postedAt?: string;
  // When the platform states these directly they're trusted over guesses from the text
  deadline?: string; // "YYYY-MM-DD"
  salaryMin?: number; // BDT per month
  salaryMax?: number;
  categoryHint?: "Government" | "Private" | "Bank" | "NGO" | "Internship";
};

// A posting we already have and didn't re-download (to spare the site extra requests):
// only "still listed" is recorded for it.
export type SeenJob = { externalId: string; unchanged: true };

export type Collector = {
  label: string; // shown in the UI
  // false = the platform only shows the newest postings (e.g. bdjobs' first page), so a posting
  // missing from the list does NOT mean it was taken down. Default true.
  fullListing?: boolean;
  // Read the open postings for one key (company / category). `known` = external IDs JobPulse already
  // has, so a collector can skip downloading details for them. Throws if the platform can't be reached.
  fetchJobs(key: string, known: Set<string>): Promise<(CollectedJob | SeenJob)[]>;
  // Recognise this platform from a link and return its key, or null.
  keyFromUrl(url: URL): string | null;
};

export function isSeen(job: CollectedJob | SeenJob): job is SeenJob {
  return "unchanged" in job;
}
