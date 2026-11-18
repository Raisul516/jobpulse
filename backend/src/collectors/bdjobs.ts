// bdjobs.com — reads the PUBLIC job pages, the same pages a browser loads.
//
// How bdjobs works: it's an Angular app. When the server renders a page it embeds the data it used
// in a <script id="ng-state"> JSON block. So we read that block from:
//   https://bdjobs.com/h/jobs           -> the 50 newest jobs (only the first page is embedded)
//   https://bdjobs.com/h/details/{id}   -> one job's full details (education, age, salary...)
// We don't call their internal API directly.
//
// Being polite (checked 2026-11-18: robots.txt allows these pages; Terms call it "a public site with free access"):
//   - 1 request for the list per run, list cached 10 minutes (shared by all bdjobs sources)
//   - detail pages only for NEW jobs in your chosen categories, max 25 per run, 1.5 s apart
//   - links always point back to bdjobs; JobPulse is for your personal use
import { CollectorError, htmlToPlainText, pause } from "./http";
import { CollectedJob, Collector, SeenJob } from "./types";

const BASE = "https://bdjobs.com";
const USER_AGENT = "Mozilla/5.0 (compatible; JobPulse/0.1; personal job tracker; reads public job pages a few times a day)";
const MAX_DETAILS_PER_RUN = 25;
const LIST_CACHE_MS = 10 * 60 * 1000;

// ---------- reading the embedded data ----------

type NgState = Record<string, unknown>;

// Angular escapes the JSON inside the HTML (&q; for ", etc.)
export function parseNgState(html: string): NgState | null {
  const m = html.match(/<script id="ng-state" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(
      m[1].replace(/&q;/g, '"').replace(/&s;/g, "'").replace(/&l;/g, "<").replace(/&g;/g, ">").replace(/&a;/g, "&")
    ) as NgState;
  } catch {
    return null;
  }
}

// The embedded HTTP responses look like { u: "<url it came from>", b: <body> }
function cachedResponse(state: NgState, urlPattern: RegExp): unknown {
  for (const value of Object.values(state)) {
    const v = value as { u?: unknown; b?: unknown } | null;
    if (v && typeof v.u === "string" && urlPattern.test(v.u)) return v.b;
  }
  return undefined;
}

async function getPage(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new CollectorError("Could not reach bdjobs.com.");
  }
  if (!response.ok) throw new CollectorError(`bdjobs.com answered with error ${response.status}.`);
  const html = await response.text();
  if (html.length > 5 * 1024 * 1024) throw new CollectorError("bdjobs.com page is unexpectedly large.");
  return html;
}

// ---------- list page ----------

export type BdjobsListItem = { Jobid: string; jobTitle: string; companyName: string; Cat_id: number; deadlineDB?: string };
export type BdjobsCategory = { id: number; name: string };

let listCache: { at: number; items: BdjobsListItem[]; categories: BdjobsCategory[] } | null = null;

export function readList(html: string): { items: BdjobsListItem[]; categories: BdjobsCategory[] } {
  const state = parseNgState(html);
  if (!state) throw new CollectorError("bdjobs.com changed its page layout (no embedded data found). The collector needs an update.");
  const search = cachedResponse(state, /JobSearch\/GetJobSearch$/) as { data?: BdjobsListItem[] } | undefined;
  if (!search?.data) throw new CollectorError("bdjobs.com changed its page layout (no job list found). The collector needs an update.");

  const rawCategories = (state.categories as { data?: unknown[] } | unknown[] | undefined) ?? [];
  const list = (Array.isArray(rawCategories) ? rawCategories : (rawCategories.data ?? [])) as {
    value: number;
    label: string;
    mainObj?: { CategoryType?: number };
  }[];
  const categories = list
    .filter((c) => c.mainObj?.CategoryType === 1) // "functional" categories (IT, Bank, NGO...), not trades
    .map((c) => ({ id: Number(c.value), name: c.label.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { items: search.data, categories };
}

export async function bdjobsList() {
  if (listCache && Date.now() - listCache.at < LIST_CACHE_MS) return listCache;
  const { items, categories } = readList(await getPage(`${BASE}/h/jobs`));
  listCache = { at: Date.now(), items, categories };
  return listCache;
}

// ---------- detail page ----------

type BdjobsDetail = {
  JobId?: string | number;
  JobTitle?: string;
  CompnayName?: string;
  CompanyNameENG?: string;
  DeadlineDB?: string;
  JobNature?: string;
  JobLocation?: string;
  Age?: string;
  experience?: string;
  fresher?: string | null;
  EducationRequirements?: string;
  SkillsRequired?: string;
  AdditionJobRequirements?: string;
  JobDescription?: string;
  JobSalaryRangeText?: string;
  JobSalaryMinSalary?: string;
  JobSalaryMaxSalary?: string;
  ApplyURL?: string;
};

// Turns the details embedded in a bdjobs job page into a CollectedJob (also used by paste-a-link).
export function readDetail(html: string, jobId: string): CollectedJob | null {
  const state = parseNgState(html);
  if (!state) return null;
  const body = cachedResponse(state, /JobSubsystem\/jobDetails/) as { data?: BdjobsDetail | BdjobsDetail[] } | undefined;
  const d = Array.isArray(body?.data) ? body.data[0] : body?.data;
  if (!d?.JobTitle) return null;

  const section = (title: string, value?: string | null) =>
    value && value.trim() ? `${title}\n${htmlToPlainText(value)}` : "";
  const descriptionText = [
    section("Job context and responsibilities", d.JobDescription),
    section("Education", d.EducationRequirements),
    section("Experience", d.experience),
    d.Age ? `Age: ${d.Age}` : "",
    section("Additional requirements", d.AdditionJobRequirements),
    d.SkillsRequired ? `Skills: ${d.SkillsRequired}` : "",
    d.fresher ? `Fresh graduates may apply: ${d.fresher}` : "",
    d.JobSalaryRangeText ? `Salary: ${d.JobSalaryRangeText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const min = Number(d.JobSalaryMinSalary);
  const max = Number(d.JobSalaryMaxSalary);
  const url = `${BASE}/h/details/${jobId}`;
  return {
    externalId: String(jobId),
    url,
    applyUrl: d.ApplyURL && /^https?:\/\//i.test(d.ApplyURL) ? d.ApplyURL : url,
    title: d.JobTitle.trim(),
    company: (d.CompnayName ?? d.CompanyNameENG ?? "").trim(),
    // "Rangpur (Rangpur Sadar)" -> the place names are matched to standard spellings in run.ts
    locationText: d.JobLocation,
    remote: /work from home|remote/i.test(d.JobLocation ?? ""),
    jobTypeText: d.JobNature,
    descriptionText,
    deadline: d.DeadlineDB ? d.DeadlineDB.slice(0, 10) : undefined,
    salaryMin: min > 0 ? min : undefined,
    salaryMax: max > 0 ? max : undefined,
  };
}

// bdjobs category -> JobPulse category
const CATEGORY_HINTS: Record<number, CollectedJob["categoryHint"]> = { 2: "Bank", 12: "NGO" };

// ---------- the collector ----------
// key = "all" or comma-separated bdjobs category ids, e.g. "8" (IT/Telecommunication) or "2,12"

export const bdjobs: Collector = {
  label: "bdjobs.com",
  fullListing: false, // only the newest 50 are visible: never close a job just because it scrolled off

  keyFromUrl(url) {
    if (!/(^|\.)bdjobs\.com$/i.test(url.hostname)) return null;
    // Our own convention for the Sources page: https://bdjobs.com/h/jobs?jobpulseCategories=8,2
    const cats = url.searchParams.get("jobpulseCategories");
    return cats && /^\d+(,\d+)*$/.test(cats) ? cats : "all";
  },

  async fetchJobs(key, known) {
    const { items } = await bdjobsList();
    const wanted = key === "all" ? null : new Set(key.split(",").map(Number));
    const relevant = items.filter((item) => !wanted || wanted.has(Number(item.Cat_id)));

    const result: (CollectedJob | SeenJob)[] = [];
    let downloaded = 0;
    for (const item of relevant) {
      const id = String(item.Jobid);
      if (known.has(id)) {
        result.push({ externalId: id, unchanged: true });
        continue;
      }
      if (downloaded >= MAX_DETAILS_PER_RUN) break; // the rest come next run
      if (downloaded > 0) await pause(1500);
      downloaded++;

      const job = readDetail(await getPage(`${BASE}/h/details/${id}`), id);
      if (job) result.push({ ...job, categoryHint: CATEGORY_HINTS[Number(item.Cat_id)] });
    }
    return result;
  },
};
