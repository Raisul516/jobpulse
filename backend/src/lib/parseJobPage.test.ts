import { describe, expect, it } from "vitest";
import { findDeadlineInText, findSalaryInText, normalizeLocation, parseDate, parseJobPage } from "./parseJobPage";

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

describe("British-style and yearless dates", () => {
  const today = new Date("2026-11-17T12:00:00");

  it.each([
    ["30th of November, 2026", "2026-11-30"],
    ["30-Nov-2026", "2026-11-30"],
    ["30-Nov-26", "2026-11-30"],
    ["30 Nov. 2026", "2026-11-30"],
    ["Monday, 30th November 2026", "2026-11-30"],
    ["Nov. 30th, 2026", "2026-11-30"],
    ["1st December 2026", "2026-12-01"],
  ])("reads %s", (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });

  it("doesn't treat ordinary words as months", () => {
    expect(parseDate("Join the 30 and 2026 club")).toBeUndefined();
  });

  it("guesses the year when the deadline has none", () => {
    expect(findDeadlineInText("Deadline: 30th November", today)).toBe("2026-11-30");
    expect(findDeadlineInText("Apply before 15 January", today)).toBe("2027-01-15"); // next January
    expect(findDeadlineInText("Applications close on December 5th.", today)).toBe("2026-12-05");
  });

  it.each([
    ["Last date to apply: 30/11/2026", "2026-11-30"],
    ["Applications close on 30 November 2026", "2026-11-30"],
    ["Please submit your CV by 30th November, 2026", "2026-11-30"],
    ["Valid till 30-Nov-2026", "2026-11-30"],
  ])("finds the deadline in %s", (input, expected) => {
    expect(findDeadlineInText(input, today)).toBe(expected);
  });
});

describe("findSalaryInText", () => {
  it("reads the trainee post you tested (word 'compensation')", () => {
    const text =
      "During the 4-month training period, trainees will receive a competitive monthly compensation ranging from BDT 35,000 to 45,000 * Upon successful completion of the program, trainees will earn a valuable certification * Subsidized daily lunch * Annual company tour * Successful trainees will be offered permanent roles as Associate Software Engineers, with a salary package between BDT 40,000 and 60,000";
    expect(findSalaryInText(text)).toEqual({ min: 35000, max: 45000 });
  });

  it.each([
    ["Salary: Tk. 30,000 - 40,000 per month", { min: 30000, max: 40000 }],
    ["Salary: 35k-50k", { min: 35000, max: 50000 }],
    ["Monthly stipend: BDT 15,000", { min: 15000, max: 15000 }],
    ["Pay Scale: Tk. 22,000-53,060 (Grade-9)", { min: 22000, max: 53060 }],
    ["Salary: BDT 6,00,000 per year", { min: 50000, max: 50000 }],
    ["Salary: 1.2 lakh", { min: 120000, max: 120000 }],
    ["বেতন: ২৫,০০০ - ৩০,০০০ টাকা", { min: 25000, max: 30000 }],
    ["Salary: BDT 30,000 (age limit 18-30)", { min: 30000, max: 30000 }],
  ])("reads %s", (input, expected) => {
    expect(findSalaryInText(banglaToAsciiForTest(input))).toEqual(expected);
  });

  it.each(["Salary: Negotiable. Experience 2-3 years", "Application fee: Tk. 300", "Payment within 30 days"])(
    "finds nothing in %s",
    (input) => {
      expect(findSalaryInText(input)).toBeUndefined();
    }
  );
});

// the real parser converts Bangla digits before searching; do the same in the test
function banglaToAsciiForTest(text: string) {
  return text.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}

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

  it("reads schema.org microdata (SmartRecruiters-style pages)", () => {
    // Same structure as a real SmartRecruiters job page: data in itemprop attributes, not JSON.
    const html = `
      <html><head><title>Trainee Engineer</title></head><body>
      <main itemscope itemtype="http://schema.org/JobPosting">
        <h1 itemprop="title">Trainee Engineer</h1>
        <ul>
          <li itemprop="jobLocation" itemscope itemtype="http://schema.org/Place">
            <span itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
              <meta itemprop="addressCountry" content="Bangladesh">
              <meta itemprop="addressLocality" content="Dhaka">
              <meta itemprop="addressRegion">
              <meta itemprop="streetAddress" content="Road 1, Banani">
            </span>
          </li>
          <li itemprop="employmentType">Full-time</li>
        </ul>
        <div itemprop="hiringOrganization" itemscope itemtype="http://schema.org/Organization">
          <meta itemprop="name" content="Example Coders Ltd.">
        </div>
        <meta itemprop="datePosted" content="2026-11-12T13:21:07.599Z">
        <div itemprop="description">
          <h2>Job Description</h2><p>Learn and build software.</p>
          <div itemprop="incentives"><p>Monthly compensation ranging from BDT 35,000 to 45,000</p></div>
          <p>Application Deadline: November 18, 2026</p>
        </div>
      </main></body></html>`;

    const job = parseJobPage(html, "https://jobs.smartrecruiters.com/Example/1-trainee-engineer");

    expect(job.title).toEqual({ value: "Trainee Engineer", foundBy: "structured" });
    expect(job.company).toEqual({ value: "Example Coders Ltd.", foundBy: "structured" });
    expect(job.location).toEqual({ value: "Dhaka", foundBy: "structured" });
    expect(job.jobType).toEqual({ value: "Full-time", foundBy: "structured" });
    expect(job.description?.value).toContain("Learn and build software.");
    expect(job.deadline?.value).toBe("2026-11-18");
    expect(job.salaryMin?.value).toBe(35000);
    expect(job.salaryMax?.value).toBe(45000);
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
