import { describe, expect, it } from "vitest";
import { detectPlatform } from ".";
import { mapJobType, toExtracted } from "./run";
import type { CollectedJob } from "./types";

describe("detectPlatform", () => {
  it.each([
    ["https://jobs.smartrecruiters.com/NiftyCodersPvtLtd/744000161297600-trainee-engineer", "smartrecruiters", "NiftyCodersPvtLtd"],
    ["https://careers.smartrecruiters.com/NiftyCodersPvtLtd", "smartrecruiters", "NiftyCodersPvtLtd"],
    ["https://boards.greenhouse.io/acme", "greenhouse", "acme"],
    ["https://job-boards.greenhouse.io/acme/jobs/123", "greenhouse", "acme"],
    ["https://boards.greenhouse.io/embed/job_board?for=acme", "greenhouse", "acme"],
    ["https://jobs.lever.co/acme/abc-123", "lever", "acme"],
  ])("%s", (link, adapter, key) => {
    expect(detectPlatform(link)).toEqual({ adapter, key });
  });

  it.each(["https://bdjobs.com/h/details/1", "https://example.com/careers", "not a link", "https://smartrecruiters.com.evil.example/x"])(
    "rejects %s",
    (link) => {
      expect(detectPlatform(link)).toBeNull();
    }
  );
});

describe("mapJobType", () => {
  it.each([
    ["Full-time", "Full-time"],
    ["permanent", "Full-time"],
    ["Part time", "Part-time"],
    ["Contract", "Contract"],
    ["Temporary", "Contract"],
    ["Intern", "Internship"],
  ])("%s -> %s", (text, expected) => {
    expect(mapJobType(text)).toBe(expected);
  });

  it("spots internships from the title", () => {
    expect(mapJobType("Full-time", "Software Engineering Intern")).toBe("Internship");
  });
});

describe("toExtracted", () => {
  const base: CollectedJob = {
    externalId: "1",
    url: "https://jobs.example/1",
    title: "Trainee Engineer",
    company: "Nifty Coders Pvt. Ltd.",
    locationText: "Dhaka, , Bangladesh",
    jobTypeText: "Full-time",
    descriptionText:
      "Monthly compensation ranging from BDT 35,000 to 45,000. Application Deadline: November 18, 2026",
  };

  it("fills every field a job needs", () => {
    const e = toExtracted(base, { name: "Nifty Coders Pvt. Ltd. (SmartRecruiters)", defaultCategory: "Private" });
    expect(e.title?.value).toBe("Trainee Engineer");
    expect(e.location?.value).toBe("Dhaka");
    expect(e.jobType).toEqual({ value: "Full-time", foundBy: "structured" });
    expect(e.category?.value).toBe("Private");
    expect(e.deadline?.value).toBe("2026-11-18");
    expect(e.salaryMin?.value).toBe(35000);
    expect(e.salaryMax?.value).toBe(45000);
  });

  it("guesses Full-time (marked as a guess) when the platform gives no job type", () => {
    const e = toExtracted({ ...base, jobTypeText: undefined, descriptionText: "Great team." }, { name: "X", defaultCategory: "Private" });
    expect(e.jobType).toEqual({ value: "Full-time", foundBy: "meta" });
  });

  it("uses the source name when the platform has no company name (Lever)", () => {
    const e = toExtracted({ ...base, company: "" }, { name: "Acme Ltd (Lever)", defaultCategory: "Private" });
    expect(e.company?.value).toBe("Acme Ltd");
  });

  it("marks remote jobs as Remote and internships as Internship category", () => {
    const e = toExtracted({ ...base, remote: true, title: "QA Intern", jobTypeText: "Intern" }, { name: "X", defaultCategory: "Bank" });
    expect(e.location?.value).toBe("Remote");
    expect(e.category?.value).toBe("Internship");
  });
});
