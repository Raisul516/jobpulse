import { describe, expect, it } from "vitest";
import { bdjobs, parseNgState, readDetail, readList } from "./bdjobs";
import { detectPlatform } from ".";

// Angular embeds data with " written as &q; — build pages the same way
function page(state: unknown): string {
  const json = JSON.stringify(state).replace(/"/g, "&q;");
  return `<html><body><app-root></app-root><script id="ng-state" type="application/json">${json}</script></body></html>`;
}

const listPage = page({
  "123": {
    u: "https://api.bdjobs.com/jobs/api/v1/JobSearch/GetJobSearch",
    b: {
      data: [
        { Jobid: "1001", jobTitle: "Software Engineer", companyName: "Sample IT Ltd", Cat_id: 8 },
        { Jobid: "1002", jobTitle: "Branch Officer", companyName: "Sample Bank PLC", Cat_id: 2 },
      ],
    },
  },
  categories: {
    data: [
      { value: 8, label: "IT/Telecommunication", mainObj: { CategoryType: 1 } },
      { value: 2, label: "Bank/Non-Bank Fin. Institution", mainObj: { CategoryType: 1 } },
      { value: 82, label: "Carpenter", mainObj: { CategoryType: 2 } },
    ],
  },
});

const detailPage = page({
  "9": {
    u: "https://api.bdjobs.com/jobs/api/v1/JobSubsystem/jobDetails?",
    b: {
      data: [
        {
          JobTitle: "Software Engineer",
          CompnayName: "Sample IT Ltd",
          DeadlineDB: "2026-12-18",
          JobNature: "Full Time",
          JobLocation: "Dhaka (Banani)",
          Age: "22 to 30 years",
          experience: "<ul><li>At least 2 years</li></ul>",
          EducationRequirements: "<ul><li>Bachelor of Science (BSc) in CSE</li></ul>",
          SkillsRequired: "React, Node.js",
          JobDescription: "<p>Build web apps.</p>",
          JobSalaryRangeText: "Tk. 40000 - 60000 (Monthly)",
          JobSalaryMinSalary: "40000",
          JobSalaryMaxSalary: "60000",
          ApplyURL: "",
        },
      ],
    },
  },
});

describe("bdjobs page reading", () => {
  it("decodes Angular's embedded state", () => {
    expect(parseNgState(page({ a: 'say "hi" & <b>' }))).toEqual({ a: 'say "hi" & <b>' });
    expect(parseNgState("<html>no data</html>")).toBeNull();
  });

  it("reads the job list and only the functional categories", () => {
    const { items, categories } = readList(listPage);
    expect(items.map((i) => i.Jobid)).toEqual(["1001", "1002"]);
    expect(categories).toEqual([
      { id: 2, name: "Bank/Non-Bank Fin. Institution" },
      { id: 8, name: "IT/Telecommunication" },
    ]);
  });

  it("says clearly when bdjobs changed its layout", () => {
    expect(() => readList("<html></html>")).toThrow(/changed its page layout/);
  });

  it("turns a detail page into a job with requirements in the text", () => {
    const job = readDetail(detailPage, "1001")!;
    expect(job).toMatchObject({
      externalId: "1001",
      url: "https://bdjobs.com/h/details/1001",
      applyUrl: "https://bdjobs.com/h/details/1001", // no separate apply link -> the bdjobs page
      title: "Software Engineer",
      company: "Sample IT Ltd",
      locationText: "Dhaka (Banani)",
      jobTypeText: "Full Time",
      deadline: "2026-12-18",
      salaryMin: 40000,
      salaryMax: 60000,
    });
    expect(job.descriptionText).toContain("Age: 22 to 30 years");
    expect(job.descriptionText).toContain("Bachelor of Science (BSc) in CSE");
  });

  it("recognises bdjobs links; category filter uses JobPulse's own parameter", () => {
    expect(detectPlatform("https://bdjobs.com/h/jobs")).toEqual({ adapter: "bdjobs", key: "all" });
    expect(detectPlatform("https://bdjobs.com/h/jobs?jobpulseCategories=8,2")).toEqual({ adapter: "bdjobs", key: "8,2" });
    expect(bdjobs.fullListing).toBe(false);
  });
});
