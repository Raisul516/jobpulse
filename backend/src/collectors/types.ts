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
};

export type Collector = {
  label: string; // shown in the UI
  // Read every open posting for one company. Throws if the platform can't be reached.
  fetchJobs(companyKey: string): Promise<CollectedJob[]>;
  // Recognise this platform from a careers-page link and return the company key, or null.
  keyFromUrl(url: URL): string | null;
};
