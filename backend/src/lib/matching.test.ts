import { describe, expect, it } from "vitest";
import { containsKeyword, experienceFactor, matchJob, MatchableJob, Preferences, similarityToScore } from "./matching";

const job: MatchableJob = {
  title: "Junior React Developer",
  description: "Build UIs with TypeScript and Next.js. Experience with Node is a plus.",
  location: "Dhaka",
  jobType: "Full-time",
  category: "Private",
  salaryMin: 30000,
  salaryMax: 40000,
};

const prefs: Preferences = {
  keywords: [],
  excludeKeywords: [],
  categories: [],
  jobTypes: [],
  locations: [],
  minSalary: null,
  matchThreshold: 70,
};

describe("containsKeyword", () => {
  it("matches whole words only", () => {
    expect(containsKeyword("Java Developer", "java")).toBe(true);
    expect(containsKeyword("JavaScript Developer", "java")).toBe(false);
  });
  it("handles symbols and phrases", () => {
    expect(containsKeyword("C++ Engineer", "c++")).toBe(true);
    expect(containsKeyword("ASP.NET developer", ".net")).toBe(true);
    expect(containsKeyword("Trainee Software Engineer", "software engineer")).toBe(true);
  });
  it("works for Bangla", () => {
    expect(containsKeyword("সহকারী প্রোগ্রামার পদে নিয়োগ", "প্রোগ্রামার")).toBe(true);
  });
});

describe("matchJob", () => {
  it("everything matches when you set nothing", () => {
    expect(matchJob(job, prefs)).toMatchObject({ score: 100, passesFilters: true, isMatch: true });
  });

  it("keyword in the title is a strong match", () => {
    const r = matchJob(job, { ...prefs, keywords: ["react"] });
    expect(r.score).toBe(70);
    expect(r.isMatch).toBe(true);
    expect(r.reasons[0].text).toContain('"react"');
  });

  it("more keywords push the score up", () => {
    expect(matchJob(job, { ...prefs, keywords: ["react", "developer", "typescript"] }).score).toBe(90);
  });

  it("description-only keywords score lower", () => {
    const r = matchJob(job, { ...prefs, keywords: ["typescript", "node"] });
    expect(r.score).toBe(50);
    expect(r.isMatch).toBe(false);
  });

  it("no keyword hits scores 0", () => {
    const r = matchJob(job, { ...prefs, keywords: ["python"] });
    expect(r.score).toBe(0);
    expect(r.reasons).toContainEqual({ text: "None of your keywords appear", good: false });
  });

  it("a failed filter is never a match, even with a perfect score", () => {
    const r = matchJob(job, { ...prefs, keywords: ["react"], locations: ["Chattogram"] });
    expect(r.score).toBe(70);
    expect(r.passesFilters).toBe(false);
    expect(r.isMatch).toBe(false);
  });

  it.each<[Partial<Preferences>, string]>([
    [{ categories: ["Government"] }, "Category"],
    [{ jobTypes: ["Internship"] }, "job type"],
    [{ excludeKeywords: ["junior"] }, "excluded"],
    [{ minSalary: 50000 }, "below your minimum"],
  ])("filter %o fails with a reason", (extra, reasonPart) => {
    const r = matchJob(job, { ...prefs, ...extra });
    expect(r.passesFilters).toBe(false);
    expect(r.reasons.some((x) => !x.good && x.text.includes(reasonPart))).toBe(true);
  });

  it("does not exclude jobs that don't state a salary", () => {
    const r = matchJob({ ...job, salaryMin: null, salaryMax: null }, { ...prefs, minSalary: 50000 });
    expect(r.passesFilters).toBe(true);
    expect(r.reasons[0].text).toContain("not stated");
  });

  it("CV similarity and CV skills add to the score", () => {
    // no keywords: only the two CV parts count
    const r = matchJob(job, prefs, { skills: ["React", "TypeScript", "Excel"], similarity: 0.5 });
    // similarity 0.5 -> 75%; 2 skills found -> 70%; weighted (0.35*75 + 0.25*70) / 0.6 = 72.9 -> 73
    expect(r.score).toBe(73);
    expect(r.reasons.map((x) => x.text)).toEqual(["Similar to your CV: 75%", "Your CV skills in this job: React, TypeScript"]);
  });

  it("combines keywords with the CV parts as a weighted average", () => {
    // keywords 70 (0.4), similarity 0.2 -> 0 (0.35), skills none -> 0 (0.25) => 28
    const r = matchJob(job, { ...prefs, keywords: ["react"] }, { skills: ["Python"], similarity: 0.2 });
    expect(r.score).toBe(28);
    expect(r.isMatch).toBe(false);
  });

  it("ignores one-letter and ambiguous skills like C, R and Go", () => {
    const r = matchJob({ ...job, description: "Go to our website. Grade C applicants welcome." }, prefs, {
      skills: ["C", "R", "Go"],
      similarity: null,
    });
    // no matchable skills and no similarity: nothing to score by
    expect(r.score).toBe(100);
    expect(r.reasons).toEqual([]);
  });

  it.each([
    [0.1, 0],
    [0.2, 0],
    [0.4, 50],
    [0.49, 73],
    [0.6, 100],
    [0.9, 100],
  ])("similarity %f -> %i%%", (similarity, expected) => {
    expect(similarityToScore(similarity)).toBe(expected);
  });

  it("a job without an embedding yet is scored without the similarity part", () => {
    const r = matchJob(job, prefs, { skills: ["React"], similarity: null });
    expect(r.score).toBe(55); // only CV skills: 1 hit -> 55
  });

  it("an eligibility fail blocks the match even with a perfect score; unknown does not", () => {
    const fail = { status: "fail" as const, checks: [{ requirement: "Age up to 24", status: "fail" as const, reason: "You are 25" }] };
    const unknown = { status: "unknown" as const, checks: [] };
    const blocked = matchJob(job, prefs, { skills: [], similarity: 0.9, eligibility: fail });
    expect(blocked.score).toBe(100);
    expect(blocked.isMatch).toBe(false);
    expect(blocked.eligibility).toBe(fail);
    expect(matchJob(job, prefs, { skills: [], similarity: 0.9, eligibility: unknown }).isMatch).toBe(true);
  });

  it("filters still win over a strong CV match", () => {
    const r = matchJob(job, { ...prefs, locations: ["Sylhet"] }, { skills: ["React"], similarity: 0.9 });
    expect(r.isMatch).toBe(false);
  });

  it("location filter ignores capital letters", () => {
    expect(matchJob(job, { ...prefs, locations: ["dhaka"] }).passesFilters).toBe(true);
  });
});

describe("experience in the score", () => {
  // keywords that fully match the title -> base score 100
  const keyPrefs: Preferences = { ...prefs, keywords: ["react"] };
  const score = (min: number | undefined, yours: number | null, extra: { max?: number; freshersWelcome?: boolean } = {}) =>
    matchJob(job, keyPrefs, { skills: [], similarity: null, experience: { min, yours, ...extra } });

  it("cuts the score harder the more years you are short", () => {
    expect(score(undefined, 0).score).toBe(70); // job states nothing: no cut (one title keyword = 70)
    expect(score(2, 3).score).toBe(70); // you meet it
    expect(score(1, 0).score).toBe(42); // 1 year short: x0.6
    expect(score(2, 0).score).toBe(25); // x0.35
    expect(score(4, 0).score).toBe(11); // x0.15
    expect(score(5, 0).score).toBe(4); // x0.05
  });

  it("0-2 years and fresher jobs are fine for a beginner", () => {
    const r = score(0, 0, { max: 2 });
    expect(r.score).toBe(70);
    expect(r.reasons).toContainEqual({ text: "Experience: 0–2 years (fits beginners)", good: true });
    expect(score(undefined, 0, { freshersWelcome: true }).reasons).toContainEqual({ text: "Fresh graduates can apply", good: true });
  });

  it("explains the cut", () => {
    expect(score(5, 0).reasons).toContainEqual({ text: "Needs 5 years+ experience, you have 0 years — score cut by 95%", good: false });
    expect(score(1, 0, { max: 2 }).reasons).toContainEqual({
      text: "Needs 1–2 years experience, you have 0 years — score cut by 40%",
      good: false,
    });
  });

  it("unknown own experience: no cut, but asks you to add it", () => {
    const r = score(3, null);
    expect(r.score).toBe(70);
    expect(r.reasons).toContainEqual({ text: "Needs 3 years+ experience — add yours on My profile to score it", good: false });
  });

  it("slightly lowers jobs far below your level", () => {
    expect(score(0, 6, { max: 2 }).score).toBe(63);
  });

  it("factor table", () => {
    expect([0, 0.5, 1, 2, 3, 4, 5, 10].map(experienceFactor)).toEqual([1, 0.6, 0.6, 0.35, 0.15, 0.15, 0.05, 0.05]);
  });
});
