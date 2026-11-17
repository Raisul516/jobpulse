// Reads a job page's HTML and GUESSES the job details.
// The result is only a draft: the user always reviews it before it becomes a job.
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { ExtractedJob, FoundBy } from "../types/extracted";

type CheerioRoot = ReturnType<typeof cheerio.load>;

const MAX_DESCRIPTION = 5000;

// ---------- small helpers ----------

function clean(text: unknown): string | undefined {
  if (typeof text !== "string") return undefined;
  const result = text.replace(/\s+/g, " ").trim();
  return result || undefined;
}

// Turn an HTML snippet into plain text.
function htmlToText(html: string): string {
  const $ = cheerio.load(`<div>${html}</div>`);
  $("br").replaceWith("\n");
  $("p, li, div, h1, h2, h3, h4").each((_i, el) => {
    $(el).append("\n");
  });
  return $("div").first().text().replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
}

function field<T>(value: T | undefined, foundBy: FoundBy) {
  return value === undefined ? undefined : { value, foundBy };
}

// ০১২৩৪৫৬৭৮৯ -> 0123456789
function banglaDigitsToAscii(text: string): string {
  return text.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}

// ---------- dates ----------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  জানুয়ারি: 1, ফেব্রুয়ারি: 2, মার্চ: 3, এপ্রিল: 4, মে: 5, জুন: 6, জুলাই: 7, আগস্ট: 8, সেপ্টেম্বর: 9, অক্টোবর: 10, নভেম্বর: 11, ডিসেম্বর: 12,
};

function monthNumber(name: string): number | undefined {
  const lower = name.toLowerCase();
  return MONTHS[lower] ?? MONTHS[lower.slice(0, 3)];
}

function toIsoDate(year: number, month: number, day: number): string | undefined {
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  // reject impossible dates like 31 February
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

// Only real month names (so words like "the" or "and" are never read as a month).
const MONTH_WORD =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|জানুয়ারি|ফেব্রুয়ারি|মার্চ|এপ্রিল|মে|জুন|জুলাই|আগস্ট|সেপ্টেম্বর|অক্টোবর|নভেম্বর|ডিসেম্বর)(?![a-z])\\.?";
const ORDINAL = "(?:st|nd|rd|th)?";
// A 4-digit year, or a 2-digit year only right after "-" or "/" (as in 30-Nov-26),
// so "30 November 26 posts" is not read as a year.
const YEAR = "(\\d{4}|(?<=[-/])\\d{2})(?!\\d)";

// 30 November 2026 · 30th of November, 2026 · 30-Nov-2026 · 30 Nov. 26 · ৩০ নভেম্বর ২০২৬
const DAY_MONTH_YEAR = new RegExp(`(?<!\\d)(\\d{1,2})${ORDINAL}(?:\\s+of)?[\\s\\-/]+${MONTH_WORD},?[\\s\\-/]+${YEAR}`, "i");
// November 30, 2026 · Nov. 30th 2026
const MONTH_DAY_YEAR = new RegExp(`${MONTH_WORD}\\s*(\\d{1,2})${ORDINAL}(?!\\d),?\\s+${YEAR}`, "i");
// No year: 30 November · 30th of Nov · November 30th
const DAY_MONTH = new RegExp(`(?<!\\d)(\\d{1,2})${ORDINAL}(?:\\s+of)?[\\s\\-/]+${MONTH_WORD}(?![\\s,\\-/]*\\d)`, "i");
const MONTH_DAY = new RegExp(`${MONTH_WORD}\\s*(\\d{1,2})${ORDINAL}(?![\\d,]*\\s*\\d{2,4})(?!\\d)`, "i");

// When a deadline has no year, it's almost always the next time that date comes around.
function inferYear(month: number, day: number, today: Date): string | undefined {
  const thisYear = toIsoDate(today.getFullYear(), month, day);
  if (!thisYear) return undefined;
  const sixtyDaysAgo = new Date(today.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);
  return thisYear >= sixtyDaysAgo ? thisYear : toIsoDate(today.getFullYear() + 1, month, day);
}

type ParseDateOptions = { allowNoYear?: boolean; today?: Date };

// Find the first date in a piece of text. Bangladesh writes numbers day-first (30/11/2026).
export function parseDate(input: string, options: ParseDateOptions = {}): string | undefined {
  const text = banglaDigitsToAscii(input);
  let m: RegExpMatchArray | null;

  // 2026-11-30 (also "2026-11-30T23:59:59" from structured data)
  if ((m = text.match(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/))) return toIsoDate(+m[1], +m[2], +m[3]);

  // 30/11/2026, 30-11-2026, 30.11.2026
  if ((m = text.match(/(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/))) return toIsoDate(+m[3], +m[2], +m[1]);

  if ((m = text.match(DAY_MONTH_YEAR))) {
    const month = monthNumber(m[2]);
    if (month) return toIsoDate(+m[3], month, +m[1]);
  }
  if ((m = text.match(MONTH_DAY_YEAR))) {
    const month = monthNumber(m[1]);
    if (month) return toIsoDate(+m[3], month, +m[2]);
  }

  if (options.allowNoYear) {
    const today = options.today ?? new Date();
    if ((m = text.match(DAY_MONTH))) {
      const month = monthNumber(m[2]);
      if (month) return inferYear(month, +m[1], today);
    }
    if ((m = text.match(MONTH_DAY))) {
      const month = monthNumber(m[1]);
      if (month) return inferYear(month, +m[2], today);
    }
  }

  return undefined;
}

// Words that usually come right before the application deadline.
const DEADLINE_LABELS = new RegExp(
  [
    "application\\s+deadline",
    "deadline(?:\\s+(?:to|for)\\s+(?:apply|application|submission))?",
    "last\\s+(?:date|day)(?:\\s+(?:of|for|to)\\s+(?:application|submission|apply))?",
    "apply\\s+(?:before|by|within|on\\s+or\\s+before)",
    "(?:submit|send)[^.]{0,40}?\\s+(?:before|by)",
    "applications?\\s+(?:close|closes|closing|will\\s+close)(?:\\s+on)?",
    "closing\\s+date",
    "valid\\s+(?:till|until|through)",
    "আবেদনের\\s+শেষ\\s+তারিখ",
    "শেষ\\s+তারিখ",
  ].join("|"),
  "gi"
);

export function findDeadlineInText(text: string, today?: Date): string | undefined {
  for (const match of text.matchAll(DEADLINE_LABELS)) {
    // look at the ~80 characters after the label
    const after = text.slice(match.index! + match[0].length, match.index! + match[0].length + 80);
    const date = parseDate(after, { allowNoYear: true, today });
    if (date) return date;
  }
  return undefined;
}

// ---------- salary ----------

// Words that come before a salary. "compensation" and "stipend" are common for trainee posts,
// "pay scale" for government jobs.
const SALARY_LABELS =
  /\b(?:salary|salaries|compensation|remuneration|stipend|allowance|wages?|pay(?:\s+scale)?|gross)\b|বেতন|সম্মানী|ভাতা/gi;

const CURRENCY = "(?:bdt|tk\\.?|taka|৳|টাকা)";
// 35,000 · 1,20,000 (lakh style) · 35000 · 35k · 1.5 lakh
const AMOUNT = "(\\d{1,3}(?:,\\d{2,3})+|\\d+(?:\\.\\d+)?)\\s*(k|lakhs?|lacs?)?(?![\\d%])";
const SALARY_RANGE = new RegExp(
  `(?:${CURRENCY}\\s*)?${AMOUNT}\\s*(?:${CURRENCY}\\s*)?(?:to|-|–|—|and|থেকে)\\s*(?:${CURRENCY}\\s*)?${AMOUNT}`,
  "i"
);
// A single amount needs something showing it's money: a currency ("BDT 30,000") or a unit ("1.2 lakh", "40k").
const SALARY_SINGLE = new RegExp(
  `${CURRENCY}\\s*${AMOUNT}|${AMOUNT}\\s*${CURRENCY}|(\\d+(?:\\.\\d+)?)\\s*(k|lakhs?|lacs?)(?![a-z\\d])`,
  "i"
);
const PER_YEAR = /^[\s)/.]*(?:per\s+(?:year|annum)|\/\s*(?:year|yr)|yearly|annually|p\.?\s?a\.?(?![a-z]))/i;

function toTaka(number: string, unit?: string): number {
  const value = Number(number.replace(/,/g, ""));
  if (!unit) return value;
  return unit.toLowerCase().startsWith("k") ? value * 1_000 : value * 100_000; // lakh / lac
}

const isMonthlyAmount = (n: number) => Number.isFinite(n) && n >= 1_000 && n <= 2_000_000;

export function findSalaryInText(text: string): { min: number; max: number } | undefined {
  for (const label of text.matchAll(SALARY_LABELS)) {
    const start = label.index! + label[0].length;
    const window = text.slice(start, start + 150);
    // "Salary: Negotiable" — don't go hunting for a number further on
    if (/^\W{0,5}(?:negotiable|competitive|as\s+per|attractive)/i.test(window) && !/\d/.test(window.slice(0, 40))) continue;

    // Try "35,000 to 45,000" first, then a single "BDT 30,000". Take the first one that looks like a real salary
    // (so an age range like "18-30" next to the salary doesn't fool us).
    const candidates: { min: number; max: number; end: number }[] = [];
    const range = window.match(SALARY_RANGE);
    if (range) {
      candidates.push({
        min: toTaka(range[1], range[2]),
        max: toTaka(range[3], range[4]),
        end: range.index! + range[0].length,
      });
    }
    const single = window.match(SALARY_SINGLE);
    if (single) {
      const amount = toTaka(single[1] ?? single[3] ?? single[5], single[2] ?? single[4] ?? single[6]);
      candidates.push({ min: amount, max: amount, end: single.index! + single[0].length });
    }

    for (let { min, max, end } of candidates) {
      // "BDT 6,00,000 per year" -> per month
      if (PER_YEAR.test(window.slice(end, end + 20))) {
        min = Math.round(min / 12);
        max = Math.round(max / 12);
      }
      if (min > max) [min, max] = [max, min];
      if (isMonthlyAmount(min) && isMonthlyAmount(max)) return { min, max };
    }
  }
  return undefined;
}

// ---------- locations ----------

// Common Bangladeshi locations; the left side is how it's written, the right side how we store it.
const LOCATIONS: [RegExp, string][] = [
  [/\bremote\b|work from home|wfh/i, "Remote"],
  [/\bdhaka\b|ঢাকা/i, "Dhaka"],
  [/\bchatt?ogram\b|\bchittagong\b|চট্টগ্রাম/i, "Chattogram"],
  [/\brajshahi\b|রাজশাহী/i, "Rajshahi"],
  [/\bkhulna\b|খুলনা/i, "Khulna"],
  [/\bsylhet\b|সিলেট/i, "Sylhet"],
  [/\bbarishal\b|\bbarisal\b|বরিশাল/i, "Barishal"],
  [/\brangpur\b|রংপুর/i, "Rangpur"],
  [/\bmymensingh\b|ময়মনসিংহ/i, "Mymensingh"],
  [/\bgazipur\b|গাজীপুর/i, "Gazipur"],
  [/\bnarayanganj\b|নারায়ণগঞ্জ/i, "Narayanganj"],
  [/\bcumilla\b|\bcomilla\b|কুমিল্লা/i, "Cumilla"],
];

export function normalizeLocation(text: string): string | undefined {
  for (const [pattern, name] of LOCATIONS) {
    if (pattern.test(text)) return name;
  }
  return undefined;
}

// ---------- schema.org JobPosting ----------

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasType(obj: JsonObject, type: string): boolean {
  const t = obj["@type"];
  return t === type || (Array.isArray(t) && t.includes(type));
}

// Microdata: the same schema.org data, written as HTML attributes instead of JSON:
//   <div itemscope itemtype="http://schema.org/JobPosting"><h1 itemprop="title">…</h1> …
// We turn it into the same shape as JSON-LD so the rest of the code doesn't care which one the page used.
function readMicrodataItem($: CheerioRoot, item: Element): JsonObject {
  const type = $(item).attr("itemtype")?.split("/").pop();
  const result: JsonObject = type ? { "@type": type } : {};

  $(item)
    .find("[itemprop]")
    .each((_i, prop) => {
      // Only this item's own properties, not ones that belong to an item nested inside it.
      if ($(prop).parent().closest("[itemscope]")[0] !== item) return;

      const $prop = $(prop);
      const name = $prop.attr("itemprop")!.trim().split(/\s+/)[0];
      let value: unknown;
      if ($prop.is("[itemscope]")) value = readMicrodataItem($, prop);
      else if ($prop.attr("content") !== undefined) value = $prop.attr("content");
      else if ($prop.is("a, link")) value = $prop.attr("href");
      else if ($prop.is("time")) value = $prop.attr("datetime") ?? $prop.text();
      else if (name === "description") value = $prop.html() ?? ""; // keep HTML, like JSON-LD does
      else value = $prop.text();

      const existing = result[name];
      result[name] = existing === undefined ? value : ([] as unknown[]).concat(existing, value);
    });

  return result;
}

// JSON-LD can be one object, an array, or wrapped in "@graph". Search all of them.
// If there's none, try microdata.
function findJobPosting($: CheerioRoot): JsonObject | undefined {
  const queue: unknown[] = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      queue.push(JSON.parse($(el).text()));
    } catch {
      // broken JSON on the page; ignore it
    }
  });
  while (queue.length) {
    const item = queue.shift();
    if (Array.isArray(item)) queue.push(...item);
    else if (isObject(item)) {
      if (hasType(item, "JobPosting")) return item;
      if (item["@graph"]) queue.push(item["@graph"]);
    }
  }

  const microdata = $('[itemscope][itemtype$="schema.org/JobPosting"]').first()[0];
  return microdata ? readMicrodataItem($, microdata) : undefined;
}

function nameOf(value: unknown): string | undefined {
  if (typeof value === "string") return clean(value);
  if (isObject(value)) return clean(value.name);
  return undefined;
}

const EMPLOYMENT_TYPES: Record<string, NonNullable<ExtractedJob["jobType"]>["value"]> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  INTERN: "Internship",
  CONTRACTOR: "Contract",
  TEMPORARY: "Contract",
};

function readJobPosting(posting: JsonObject): ExtractedJob {
  const result: ExtractedJob = {};

  result.title = field(clean(posting.title), "structured");
  result.company = field(nameOf(posting.hiringOrganization), "structured");

  const types = ([] as unknown[]).concat(posting.employmentType ?? []);
  for (const t of types) {
    const mapped = typeof t === "string" ? EMPLOYMENT_TYPES[t.toUpperCase().replace(/[\s-]/g, "_")] : undefined;
    if (mapped) {
      result.jobType = field(mapped, "structured");
      break;
    }
  }

  if (posting.jobLocationType === "TELECOMMUTE") {
    result.location = field("Remote", "structured");
  } else {
    const places = ([] as unknown[]).concat(posting.jobLocation ?? []);
    for (const place of places) {
      const address = isObject(place) ? place.address : undefined;
      const parts = isObject(address)
        ? [address.addressLocality, address.addressRegion, address.streetAddress].filter((p) => typeof p === "string")
        : typeof address === "string" ? [address] : [];
      const text = parts.join(" ");
      const location = normalizeLocation(text) ?? clean(text);
      if (location) {
        result.location = field(location, "structured");
        break;
      }
    }
  }

  if (typeof posting.validThrough === "string") {
    result.deadline = field(parseDate(posting.validThrough), "structured");
  }

  const salary = isObject(posting.baseSalary) ? posting.baseSalary : undefined;
  const salaryValue = salary && isObject(salary.value) ? salary.value : undefined;
  // only trust it when it's clearly BDT per month
  const unit = String(salaryValue?.unitText ?? "MONTH").toUpperCase();
  const currency = String(salary?.currency ?? "BDT").toUpperCase();
  if (salaryValue && unit === "MONTH" && currency === "BDT") {
    const min = Number(salaryValue.minValue ?? salaryValue.value);
    const max = Number(salaryValue.maxValue ?? salaryValue.value);
    if (Number.isFinite(min) && min > 0) result.salaryMin = field(Math.round(min), "structured");
    if (Number.isFinite(max) && max > 0) result.salaryMax = field(Math.round(max), "structured");
  }

  if (typeof posting.description === "string") {
    result.description = field(htmlToText(posting.description).slice(0, MAX_DESCRIPTION) || undefined, "structured");
  }

  const direct = typeof posting.url === "string" ? posting.url : undefined;
  if (direct && /^https?:\/\//i.test(direct)) result.applyUrl = field(direct, "structured");

  return result;
}

// ---------- main ----------

function guessCategory(host: string, company?: string, text?: string): ExtractedJob["category"] {
  if (/\.gov\.bd$/i.test(host)) return { value: "Government", foundBy: "meta" };
  if (company && /\bbank\b|ব্যাংক/i.test(company)) return { value: "Bank", foundBy: "text" };
  if (text && /\binternship\b|\bintern\b/i.test(text.slice(0, 300))) return { value: "Internship", foundBy: "text" };
  return undefined;
}

export function parseJobPage(html: string, pageUrl: string): ExtractedJob {
  const $ = cheerio.load(html);
  const host = new URL(pageUrl).hostname;

  // 1) Structured data (most reliable)
  const posting = findJobPosting($);
  const result: ExtractedJob = posting ? readJobPosting(posting) : {};

  // 2) Page title and preview tags
  const meta = (name: string) =>
    clean($(`meta[property="${name}"]`).attr("content")) ?? clean($(`meta[name="${name}"]`).attr("content"));

  if (!result.title) {
    const title = clean($("h1").first().text()) ?? meta("og:title") ?? clean($("title").first().text());
    // page titles often look like "Frontend Developer | Company Name" — keep the first part
    result.title = field(title?.split(/\s+[|–—]\s+|\s+-\s+/)[0]?.trim() || undefined, "meta");
  }
  if (!result.company) result.company = field(meta("og:site_name"), "meta");
  if (!result.description) {
    result.description = field(meta("og:description") ?? meta("description"), "meta");
  }

  // 3) Visible text
  $("script, style, noscript, svg").remove();
  const bodyText = banglaDigitsToAscii($("body").text().replace(/\s+/g, " "));

  if (!result.deadline) result.deadline = field(findDeadlineInText(bodyText), "text");
  if (!result.salaryMin && !result.salaryMax) {
    const salary = findSalaryInText(bodyText);
    if (salary) {
      result.salaryMin = field(salary.min, "text");
      result.salaryMax = field(salary.max, "text");
    }
  }
  if (!result.location) result.location = field(normalizeLocation(bodyText.slice(0, 4000)), "text");
  if (!result.jobType) {
    const head = bodyText.slice(0, 4000);
    const type = /\bintern(ship)?\b/i.test(result.title?.value ?? "")
      ? "Internship"
      : /\bpart[\s-]?time\b/i.test(head)
        ? "Part-time"
        : /\bcontract(ual)?\b/i.test(head)
          ? "Contract"
          : /\bfull[\s-]?time\b/i.test(head)
            ? "Full-time"
            : undefined;
    result.jobType = field(type, "text");
  }
  result.category = guessCategory(host, result.company?.value, result.title?.value);

  if (!result.applyUrl) result.applyUrl = field(pageUrl, "meta");

  // drop empty keys so the JSON stays tidy
  for (const key of Object.keys(result) as (keyof ExtractedJob)[]) {
    if (result[key] === undefined) delete result[key];
  }
  return result;
}
