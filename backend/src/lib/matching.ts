// Simple, explainable job matching (no AI yet — that comes later and will add to this, not replace it).
//
// Two separate questions, on purpose:
//   1. Does the job pass your FILTERS? (category, location, job type, excluded words, minimum salary)
//      A job that fails a filter is never a match, however high its score.
//   2. How RELEVANT is it? A 0–100 score from your keywords: a keyword in the title counts most.
// Every result comes with human-readable reasons, so you can see WHY.

export type Preferences = {
  keywords: string[];
  excludeKeywords: string[];
  categories: string[]; // empty = any
  jobTypes: string[]; // empty = any
  locations: string[]; // empty = any
  minSalary: number | null;
  matchThreshold: number;
};

export type MatchableJob = {
  title: string;
  description: string | null;
  location: string;
  jobType: string;
  category: string;
  salaryMin: number | null;
  salaryMax: number | null;
};

export type MatchResult = {
  score: number; // 0–100 relevance
  passesFilters: boolean;
  isMatch: boolean; // passes filters AND score >= threshold
  reasons: { text: string; good: boolean }[];
};

// Whole-word match for English ("java" must not match "javascript"); plain "contains" for Bangla,
// because \b word boundaries don't work with Bangla letters.
export function containsKeyword(text: string, keyword: string): boolean {
  const k = keyword.trim().toLowerCase();
  if (!k) return false;
  const t = text.toLowerCase();
  if (/[^\x00-\x7f]/.test(k)) return t.includes(k);
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Word boundary only on a side where the keyword starts/ends with a letter or digit,
  // so "c++" and ".net" (in "ASP.NET") still match.
  const before = /^[a-z0-9]/.test(k) ? "(?<![a-z0-9])" : "";
  const after = /[a-z0-9]$/.test(k) ? "(?![a-z0-9])" : "";
  return new RegExp(`${before}${escaped}${after}`, "i").test(t);
}

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function matchJob(job: MatchableJob, prefs: Preferences): MatchResult {
  const reasons: MatchResult["reasons"] = [];
  let passesFilters = true;
  const fail = (text: string) => {
    passesFilters = false;
    reasons.push({ text, good: false });
  };

  // ---------- 1. filters ----------
  if (prefs.categories.length && !prefs.categories.includes(job.category)) {
    fail(`Category ${job.category} is not one you chose`);
  }
  if (prefs.jobTypes.length && !prefs.jobTypes.includes(job.jobType)) {
    fail(`${job.jobType} is not a job type you chose`);
  }
  if (prefs.locations.length && !prefs.locations.some((l) => sameText(l, job.location))) {
    fail(`Location ${job.location} is not one you chose`);
  }
  const excluded = prefs.excludeKeywords.filter((k) => containsKeyword(job.title, k));
  if (excluded.length) {
    fail(`Title has a word you excluded: ${excluded.map((k) => `"${k}"`).join(", ")}`);
  }
  if (prefs.minSalary !== null) {
    const best = job.salaryMax ?? job.salaryMin;
    if (best === null) {
      reasons.push({ text: "Salary not stated — check before applying", good: true });
    } else if (best < prefs.minSalary) {
      fail(`Salary up to ${best.toLocaleString("en-US")} BDT is below your minimum ${prefs.minSalary.toLocaleString("en-US")}`);
    }
  }

  // ---------- 2. relevance score ----------
  let score: number;
  if (prefs.keywords.length === 0) {
    // No keywords: everything that passes your filters is relevant.
    score = 100;
  } else {
    const titleHits = prefs.keywords.filter((k) => containsKeyword(job.title, k));
    const descHits = prefs.keywords.filter((k) => !titleHits.includes(k) && containsKeyword(job.description ?? "", k));

    if (titleHits.length) {
      score = 70 + 15 * (titleHits.length - 1) + 5 * descHits.length;
    } else if (descHits.length) {
      score = 40 + 10 * (descHits.length - 1);
    } else {
      score = 0;
    }
    score = Math.min(100, score);

    if (titleHits.length) reasons.push({ text: `Title mentions ${titleHits.map((k) => `"${k}"`).join(", ")}`, good: true });
    if (descHits.length) reasons.push({ text: `Description mentions ${descHits.map((k) => `"${k}"`).join(", ")}`, good: true });
    if (!titleHits.length && !descHits.length) reasons.push({ text: "None of your keywords appear", good: false });
  }

  return { score, passesFilters, isMatch: passesFilters && score >= prefs.matchThreshold, reasons };
}
