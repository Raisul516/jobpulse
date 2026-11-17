// Lever public Postings API (no key needed).
//   https://api.lever.co/v0/postings/{company}?mode=json
import { CollectedJob, Collector } from "./types";
import { getJson, htmlToPlainText } from "./http";

type LeverPosting = {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  workplaceType?: string; // "remote" | "hybrid" | "onsite"
  categories?: { location?: string; commitment?: string; team?: string; allLocations?: string[] };
  descriptionPlain?: string;
  description?: string;
  lists?: { text?: string; content?: string }[];
  additionalPlain?: string;
};

export const lever: Collector = {
  label: "Lever",

  keyFromUrl(url) {
    // jobs.lever.co/acme  or  jobs.lever.co/acme/1234-...
    if (!/(^|\.)lever\.co$/i.test(url.hostname)) return null;
    const first = url.pathname.split("/").filter(Boolean)[0];
    return first && /^[A-Za-z0-9_.-]+$/.test(first) ? first : null;
  },

  async fetchJobs(company) {
    const postings = await getJson<LeverPosting[]>(
      `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`
    );

    return postings.map((p): CollectedJob => {
      const lists = (p.lists ?? [])
        .map((l) => `${l.text ?? ""}\n${htmlToPlainText(l.content ?? "")}`)
        .join("\n\n");
      return {
        externalId: p.id,
        url: p.hostedUrl,
        applyUrl: p.applyUrl ?? p.hostedUrl,
        title: p.text,
        // Lever doesn't send the company's display name; the source name is used instead (see run.ts)
        company: "",
        locationText: p.categories?.location,
        remote: p.workplaceType === "remote",
        jobTypeText: p.categories?.commitment,
        descriptionText: [p.descriptionPlain ?? htmlToPlainText(p.description ?? ""), lists, p.additionalPlain ?? ""]
          .filter(Boolean)
          .join("\n\n"),
        postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
      };
    });
  },
};
