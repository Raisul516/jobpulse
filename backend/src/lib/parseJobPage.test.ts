import { describe, expect, it } from "vitest";
import { findDeadlineInText, normalizeLocation, parseDate, parseJobPage } from "./parseJobPage";

describe("parseDate", () => {
  it.each([
    ["2026-11-30", "2026-11-30"],
    ["30/11/2026", "2026-11-30"], // Bangladesh: day first
    ["5-1-2027", "2027-01-05"],
    ["30.11.2026", "2026-11-30"],
    ["30 November 2026", "2026-11-30"],
    ["30th Nov, 2026", "2026-11-30"],
    ["November 30, 2026", "2026-11-30"],
    ["৩০ নভেম্বর ২০২৬", "2026-11-30"], // Bangla digits and month
    ["৩০/১১/২০২৬", "2026-11-30"],
  ])("reads %s", (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });

  it("rejects impossible dates", () => {
    expect(parseDate("31/02/2026")).toBeUndefined();
  });

  it("returns undefined when there is no date", () => {
    expect(parseDate("as soon as possible")).toBeUndefined();
  });
});

describe("findDeadlineInText", () => {
  it("finds the date after a deadline label", () => {
    expect(findDeadlineInText("Posted 1 Nov 2026. Application Deadline: 30 Nov 2026")).toBe("2026-11-30");
  });

  it("ignores dates that aren't the deadline", () => {
    expect(findDeadlineInText("Published on 01/11/2026. Salary negotiable.")).toBeUndefined();
  });

  it("understands Bangla labels", () => {
    expect(findDeadlineInText("আবেদনের শেষ তারিখ: ১৫/১২/২০২৬")).toBe("2026-12-15");
  });
});

describe("normalizeLocation", () => {
  it("maps old and Bangla spellings", () => {
    expect(normalizeLocation("Agrabad, Chittagong")).toBe("Chattogram");
    expect(normalizeLocation("ঢাকা")).toBe("Dhaka");
    expect(normalizeLocation("Work from home")).toBe("Remote");
    expect(normalizeLocation("Somewhere else")).toBeUndefined();
  });
});

describe("parseJobPage", () => {
  it("prefers schema.org JobPosting data", () => {
    const html = `
      <html><head>
        <title>Careers | Wrong Title</title>
        <script type="application/ld+json">
        {"@context":"https://schema.org","@graph":[
          {"@type":"Organization","name":"Ignore Me"},
          {"@type":"JobPosting",
           "title":"Software Engineer",
           "hiringOrganization":{"@type":"Organization","name":"Example Ltd"},
           "employmentType":"FULL_TIME",
           "validThrough":"2026-12-31T23:59:59+06:00",
           "jobLocation":{"@type":"Place","address":{"addressLocality":"Chittagong","addressCountry":"BD"}},
           "baseSalary":{"currency":"BDT","value":{"minValue":40000,"maxValue":60000,"unitText":"MONTH"}},
           "description":"<p>Build things.</p><ul><li>TypeScript</li></ul>"}
        ]}
        </script>
      </head><body><h1>Something else</h1></body></html>`;

    const job = parseJobPage(html, "https://careers.example.com/jobs/1");

    expect(job.title).toEqual({ value: "Software Engineer", foundBy: "structured" });
    expect(job.company?.value).toBe("Example Ltd");
    expect(job.jobType?.value).toBe("Full-time");
    expect(job.deadline?.value).toBe("2026-12-31");
    expect(job.location?.value).toBe("Chattogram");
    expect(job.salaryMin?.value).toBe(40000);
    expect(job.salaryMax?.value).toBe(60000);
    expect(job.description?.value).toContain("TypeScript");
    expect(job.applyUrl?.value).toBe("https://careers.example.com/jobs/1");
  });

  it("falls back to page title and visible text", () => {
    const html = `
      <html><head>
        <title>Junior Officer | Sample Bank PLC</title>
        <meta property="og:site_name" content="Sample Bank PLC">
      </head><body>
        <h1>Junior Officer</h1>
        <p>Job location: Sylhet. Full time position.</p>
        <p>Last date of application: 15/12/2026</p>
      </body></html>`;

    const job = parseJobPage(html, "https://samplebank.example/jobs/junior-officer");

    expect(job.title).toEqual({ value: "Junior Officer", foundBy: "meta" });
    expect(job.company?.value).toBe("Sample Bank PLC");
    expect(job.deadline).toEqual({ value: "2026-12-15", foundBy: "text" });
    expect(job.location?.value).toBe("Sylhet");
    expect(job.jobType?.value).toBe("Full-time");
    expect(job.category?.value).toBe("Bank");
  });

  it("marks .gov.bd pages as Government", () => {
    const job = parseJobPage("<html><body><h1>Office Assistant</h1></body></html>", "https://example.gov.bd/notice/1");
    expect(job.category?.value).toBe("Government");
  });

  it("skips salary that isn't monthly BDT", () => {
    const html = `<script type="application/ld+json">{"@type":"JobPosting","title":"X",
      "baseSalary":{"currency":"USD","value":{"value":5000,"unitText":"MONTH"}}}</script>`;
    const job = parseJobPage(html, "https://example.com/x");
    expect(job.salaryMin).toBeUndefined();
  });

  it("survives broken JSON-LD", () => {
    const html = `<script type="application/ld+json">{ not json</script><h1>Driver</h1>`;
    expect(parseJobPage(html, "https://example.com/x").title?.value).toBe("Driver");
  });
});
