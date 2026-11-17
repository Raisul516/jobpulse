import type { Eligibility } from "./eligibility";

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
  isMatch: boolean; // passes filters AND score >= threshold AND not ineligible
  reasons: { text: string; good: boolean }[];
  eligibility: Eligibility | null; // null = no confirmed CV profile to check against
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

// What we know from your confirmed CV profile (both optional).
export type CvSignals = {
  skills: string[];
  similarity: number | null; // cosine similarity between your profile and this job, or null if not computed yet
  eligibility?: Eligibility; // mandatory requirements checked against your profile
};

export function matchJob(job: MatchableJob, prefs: Preferences, cv?: CvSignals): MatchResult {
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
  // Up to three parts, each 0–100, combined as a weighted average of the parts that are available.
  const parts: { score: number; weight: number }[] = [];

  // a) your keywords
  if (prefs.keywords.length) {
    const titleHits = prefs.keywords.filter((k) => containsKeyword(job.title, k));
    const descHits = prefs.keywords.filter((k) => !titleHits.includes(k) && containsKeyword(job.description ?? "", k));

    let keywordScore: number;
    if (titleHits.length) {
      keywordScore = 70 + 15 * (titleHits.length - 1) + 5 * descHits.length;
    } else if (descHits.length) {
      keywordScore = 40 + 10 * (descHits.length - 1);
    } else {
      keywordScore = 0;
    }
    parts.push({ score: Math.min(100, keywordScore), weight: WEIGHTS.keywords });

    if (titleHits.length) reasons.push({ text: `Title mentions ${titleHits.map((k) => `"${k}"`).join(", ")}`, good: true });
    if (descHits.length) reasons.push({ text: `Description mentions ${descHits.map((k) => `"${k}"`).join(", ")}`, good: true });
    if (!titleHits.length && !descHits.length) reasons.push({ text: "None of your keywords appear", good: false });
  }

  // b) how close the job's meaning is to your CV (from the embeddings)
  if (cv?.similarity !== undefined && cv.similarity !== null) {
    const cvScore = similarityToScore(cv.similarity);
    parts.push({ score: cvScore, weight: WEIGHTS.cvSimilarity });
    reasons.push({ text: `Similar to your CV: ${cvScore}%`, good: cvScore >= 50 });
  }

  // c) skills from your CV that the job mentions
  const cvSkills = (cv?.skills ?? []).filter(isMatchableSkill);
  if (cvSkills.length) {
    const jobText = `${job.title}\n${job.description ?? ""}`;
    const hits = cvSkills.filter((s) => containsKeyword(jobText, s));
    parts.push({ score: hits.length ? Math.min(100, 40 + 15 * hits.length) : 0, weight: WEIGHTS.cvSkills });
    reasons.push(
      hits.length
        ? { text: `Your CV skills in this job: ${hits.slice(0, 6).join(", ")}${hits.length > 6 ? "…" : ""}`, good: true }
        : { text: "None of your CV skills are mentioned", good: false }
    );
  }

  // Nothing to score by (no keywords, no CV): everything that passes your filters counts.
  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  const score = totalWeight ? roundHalfUp(parts.reduce((sum, p) => sum + p.score * p.weight, 0) / totalWeight) : 100;

  // Eligibility is NOT part of the score: a clear "fail" blocks the match whatever the score.
  // ("unknown" doesn't block — it's shown so you can check yourself.)
  const eligibility = cv?.eligibility ?? null;
  const eligible = eligibility?.status !== "fail";

  return {
    score,
    passesFilters,
    isMatch: passesFilters && eligible && score >= prefs.matchThreshold,
    reasons,
    eligibility,
  };
}

// Decimal maths in computers is slightly off (87.5 can come out as 87.4999…); the tiny nudge makes .5 round up as expected.
const roundHalfUp = (n: number) => Math.round(n + 1e-9);

export const WEIGHTS = { keywords: 0.4, cvSimilarity: 0.35, cvSkills: 0.25 };

// Cosine similarity from the embedding model -> 0–100.
// With this model, unrelated jobs land around 0.2–0.3. A real job page that fits well scores
// about 0.5 (company boilerplate in the description pulls it down), a very close one 0.6+.
// So 0.2 counts as 0% and 0.6 as 100%. A starting calibration: adjust once more real jobs are collected.
export function similarityToScore(similarity: number): number {
  const scaled = (similarity - 0.2) / (0.6 - 0.2);
  return roundHalfUp(Math.max(0, Math.min(1, scaled)) * 100);
}

// One- or two-letter skill names ("C", "R") and "Go" are ordinary words or letters in job text,
// so they would match almost everything.
const AMBIGUOUS_SKILLS = new Set(["go"]);
function isMatchableSkill(skill: string): boolean {
  const s = skill.trim().toLowerCase();
  return s.length > 1 && !AMBIGUOUS_SKILLS.has(s);
}
