// SmartRecruiters public Posting API (no key needed; it's what company career pages use).
//   list:   https://api.smartrecruiters.com/v1/companies/{company}/postings
//   detail: https://api.smartrecruiters.com/v1/companies/{company}/postings/{id}
import { CollectedJob, Collector } from "./types";
import { getJson, htmlToPlainText, pause } from "./http";

type Listing = { id: string; name: string };
type ListPage = { totalFound: number; content: Listing[] };
type Detail = {
  id: string;
  name: string;
  company?: { name?: string };
  location?: { city?: string; region?: string; country?: string; remote?: boolean; fullLocation?: string };
  typeOfEmployment?: { label?: string };
  releasedDate?: string;
  postingUrl?: string;
  applyUrl?: string;
  jobAd?: { sections?: Record<string, { title?: string; text?: string }> };
};

const API = "https://api.smartrecruiters.com/v1/companies";
const PAGE_SIZE = 100;
const MAX_POSTINGS = 500;

export const smartRecruiters: Collector = {
  label: "SmartRecruiters",

  keyFromUrl(url) {
    // jobs.smartrecruiters.com/NiftyCodersPvtLtd/744000...-trainee-engineer  or  careers.smartrecruiters.com/NiftyCodersPvtLtd
    if (!/(^|\.)smartrecruiters\.com$/i.test(url.hostname)) return null;
    const first = url.pathname.split("/").filter(Boolean)[0];
    return first && /^[A-Za-z0-9_-]+$/.test(first) ? first : null;
  },

  async fetchJobs(company) {
    const key = encodeURIComponent(company);
    const listings: Listing[] = [];
    for (let offset = 0; offset < MAX_POSTINGS; offset += PAGE_SIZE) {
      const page = await getJson<ListPage>(`${API}/${key}/postings?limit=${PAGE_SIZE}&offset=${offset}`);
      listings.push(...page.content);
      if (page.content.length < PAGE_SIZE || listings.length >= page.totalFound) break;
      await pause(500);
    }

    const jobs: CollectedJob[] = [];
    for (const listing of listings) {
      // The list doesn't include the job text; the detail call does (we need it for deadline and salary).
      const d = await getJson<Detail>(`${API}/${key}/postings/${encodeURIComponent(listing.id)}`);
      const sections = Object.values(d.jobAd?.sections ?? {});
      const descriptionText = sections
        .filter((s) => s.text)
        .map((s) => `${s.title ?? ""}\n${htmlToPlainText(s.text!)}`)
        .join("\n\n");

      jobs.push({
        externalId: d.id,
        url: d.postingUrl ?? `https://jobs.smartrecruiters.com/${key}/${d.id}`,
        applyUrl: d.applyUrl,
        title: d.name,
        company: d.company?.name ?? company,
        locationText: d.location?.fullLocation ?? [d.location?.city, d.location?.region].filter(Boolean).join(", "),
        remote: d.location?.remote,
        jobTypeText: d.typeOfEmployment?.label,
        descriptionText,
        postedAt: d.releasedDate,
      });
      await pause(300);
    }
    return jobs;
  },
};
