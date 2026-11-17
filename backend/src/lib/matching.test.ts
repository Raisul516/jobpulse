import { describe, expect, it } from "vitest";
import { containsKeyword, matchJob, MatchableJob, Preferences } from "./matching";

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

  it("location filter ignores capital letters", () => {
    expect(matchJob(job, { ...prefs, locations: ["dhaka"] }).passesFilters).toBe(true);
  });
});
