// Greenhouse public Job Board API (no key needed).
//   https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true
import { CollectedJob, Collector } from "./types";
import { getJson, htmlToPlainText } from "./http";

type GreenhouseJob = {
  id: number;
  title: string;
  updated_at?: string;
  first_published?: string;
  absolute_url: string;
  location?: { name?: string };
  content?: string; // HTML, but with < > escaped as &lt; &gt;
  company_name?: string;
  metadata?: { name?: string; value?: unknown }[] | null;
};

type Board = { name?: string };

function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export const greenhouse: Collector = {
  label: "Greenhouse",

  keyFromUrl(url) {
    // boards.greenhouse.io/acme, job-boards.greenhouse.io/acme/jobs/123
    if (!/(^|\.)greenhouse\.io$/i.test(url.hostname)) return null;
    const fromQuery = url.searchParams.get("for"); // boards.greenhouse.io/embed/job_board?for=acme
    if (fromQuery) return fromQuery;
    const first = url.pathname.split("/").filter(Boolean)[0];
    return first && first !== "embed" && /^[A-Za-z0-9_-]+$/.test(first) ? first : null;
  },

  async fetchJobs(boardToken) {
    const key = encodeURIComponent(boardToken);
    const [board, list] = await Promise.all([
      getJson<Board>(`https://boards-api.greenhouse.io/v1/boards/${key}`).catch(() => ({}) as Board),
      getJson<{ jobs: GreenhouseJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${key}/jobs?content=true`),
    ]);

    return list.jobs.map((job): CollectedJob => {
      const employment = job.metadata?.find((m) => /employment|job type|commitment/i.test(m.name ?? ""));
      return {
        externalId: String(job.id),
        url: job.absolute_url,
        applyUrl: job.absolute_url,
        title: job.title,
        company: job.company_name ?? board.name ?? boardToken,
        locationText: job.location?.name,
        remote: /remote/i.test(job.location?.name ?? ""),
        jobTypeText: typeof employment?.value === "string" ? employment.value : undefined,
        descriptionText: htmlToPlainText(unescapeHtml(job.content ?? "")),
        postedAt: job.first_published ?? job.updated_at,
      };
    });
  },
};
