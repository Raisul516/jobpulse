import { describe, expect, it } from "vitest";
import { checkEligibility, EligibilityProfile, extractRequirements } from "./eligibility";

describe("extractRequirements", () => {
  it("reads a typical private job", () => {
    const req = extractRequirements(`
      Requirements:
      • Bachelor's degree in CSE, EEE or related field from a reputed university.
      • Minimum CGPA 3.00 out of 4.00.
      • At least 2 years of experience in web development.
      • Experience with Docker is a plus.`);
    expect(req).toEqual({ minEducation: "Bachelor", subjects: ["CSE", "EEE"], minCgpa: 3, minExperienceYears: 2 });
  });

  it("reads a government-style age limit with a reference date", () => {
    const req = extractRequirements(
      "Age limit: maximum 30 years as on 01/11/2026. Educational qualification: Graduation in any discipline."
    );
    expect(req.maxAge).toBe(30);
    expect(req.ageReferenceDate).toBe("2026-11-01");
    expect(req.minEducation).toBe("Bachelor");
    expect(req.subjects).toBeUndefined(); // "any discipline"
  });

  it("reads age ranges and Bangla", () => {
    expect(extractRequirements("Age: 18 to 30 years.")).toMatchObject({ minAge: 18, maxAge: 30 });
    expect(extractRequirements("প্রার্থীর বয়স সর্বোচ্চ ৩২ বছর।").maxAge).toBe(32);
    expect(extractRequirements("শিক্ষাগত যোগ্যতা: স্নাতকোত্তর ডিগ্রি।").minEducation).toBe("Masters");
  });

  it("ignores preferred requirements", () => {
    expect(extractRequirements("Master's degree is preferred. 5 years of experience will be an advantage.")).toEqual({});
  });

  it("fresh graduates means no experience needed", () => {
    const req = extractRequirements("1-2 years of experience. Fresh graduates are encouraged to apply.");
    expect(req.minExperienceYears).toBeUndefined();
    expect(req.freshersWelcome).toBe(true);
  });

  it("takes the lowest level when several are allowed", () => {
    expect(extractRequirements("Bachelor's or Master's degree in Computer Science required.").minEducation).toBe("Bachelor");
  });

  it("does not mistake ordinary words for degrees or subjects", () => {
    // "bank", "it", "manager" must not become BA / IT / MA
    expect(extractRequirements("Minimum qualification: it is required to have bank experience as a manager.")).toEqual({});
  });

  it("ignores 5-point GPA (SSC/HSC) as CGPA requirement", () => {
    expect(extractRequirements("Minimum GPA 4.50 in SSC and HSC is required.").minCgpa).toBeUndefined();
  });
});

describe("checkEligibility", () => {
  const profile: EligibilityProfile = {
    dateOfBirth: "2001-05-10",
    education: [
      { level: "Bachelor", degree: "B.Sc. in Computer Science and Engineering", subject: "Computer Science and Engineering", institution: "Sample University", result: "CGPA: 3.09/4.00", year: 2026 },
      { level: "HSC", degree: "HSC", subject: null, institution: null, result: "GPA: 5.00/5.00", year: 2021 },
    ],
    experienceYears: null,
  };
  const opts = { deadline: "2026-12-01", isGovernment: false, today: "2026-11-17" };

  it("passes age checked on the deadline", () => {
    const r = checkEligibility({ maxAge: 30 }, profile, opts);
    expect(r).toEqual({ status: "pass", checks: [{ requirement: "Age up to 30", status: "pass", reason: "You are 25 on the deadline" }] });
  });

  it("fails age with a quota hint for government jobs", () => {
    const r = checkEligibility({ maxAge: 24 }, profile, { ...opts, isGovernment: true });
    expect(r.status).toBe("fail");
    expect(r.checks[0].reason).toContain("quotas");
  });

  it("uses the circular's own reference date", () => {
    const r = checkEligibility({ maxAge: 25, ageReferenceDate: "2026-05-01" }, profile, opts);
    expect(r.checks[0].reason).toBe("You are 24 on 2026-05-01");
  });

  it("a degree finishing next year is 'unknown', not pass or fail", () => {
    const r = checkEligibility({ minEducation: "Bachelor" }, profile, { ...opts, today: "2025-06-01" });
    expect(r.status).toBe("unknown");
    expect(r.checks[0].reason).toContain("finishes in 2026");
  });

  it("checks subject and CGPA", () => {
    const r = checkEligibility({ minEducation: "Bachelor", subjects: ["CSE", "EEE"], minCgpa: 3.25 }, profile, opts);
    expect(r.checks.map((c) => [c.requirement, c.status])).toEqual([
      ["Bachelor degree in CSE / EEE", "pass"],
      ["Subject: CSE / EEE", "pass"],
      ["CGPA 3.25+", "fail"],
    ]);
    expect(r.status).toBe("fail");
  });

  it("wrong subject fails", () => {
    const r = checkEligibility({ minEducation: "Bachelor", subjects: ["Business"] }, profile, opts);
    expect(r.checks[1]).toMatchObject({ status: "fail", reason: "Your subject: CSE" });
  });

  it("unknown experience is 'unknown', never a silent pass", () => {
    const r = checkEligibility({ minExperienceYears: 2 }, profile, opts);
    expect(r).toEqual({
      status: "unknown",
      checks: [{ requirement: "2+ years experience", status: "unknown", reason: "Add your years of experience on My profile" }],
    });
  });

  it("no requirements found = none", () => {
    expect(checkEligibility({}, profile, opts).status).toBe("none");
  });

  it("missing date of birth makes age unknown", () => {
    expect(checkEligibility({ maxAge: 30 }, { ...profile, dateOfBirth: null }, opts).checks[0].status).toBe("unknown");
  });
});
