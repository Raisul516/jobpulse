// What the page parser managed to find. Every field can be missing.
// `foundBy` tells the user HOW we found each value, so they know how much to trust it:
//   "structured" = the page's own machine-readable job data (schema.org JobPosting) — most reliable
//   "meta"       = page title / social-media preview tags
//   "text"       = guessed by searching the visible text — check carefully
export type FoundBy = "structured" | "meta" | "text";

export type ExtractedField<T> = { value: T; foundBy: FoundBy };

export type ExtractedJob = {
  title?: ExtractedField<string>;
  company?: ExtractedField<string>;
  location?: ExtractedField<string>;
  jobType?: ExtractedField<"Full-time" | "Part-time" | "Internship" | "Contract">;
  category?: ExtractedField<"Government" | "Private" | "Bank" | "NGO" | "Internship">;
  salaryMin?: ExtractedField<number>;
  salaryMax?: ExtractedField<number>;
  deadline?: ExtractedField<string>; // "YYYY-MM-DD"
  applyUrl?: ExtractedField<string>;
  description?: ExtractedField<string>;
};
