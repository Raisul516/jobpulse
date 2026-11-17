// Small helper for calling the platforms' public job APIs politely:
// identify ourselves, time out, limit the size, and pause between requests.
import * as cheerio from "cheerio";

const USER_AGENT = "JobPulse/0.1 (personal job tracker; reads public job-board APIs a few times a day)";
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 10 * 1024 * 1024;

export class CollectorError extends Error {}

export async function getJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new CollectorError(timedOut ? "The platform took too long to answer." : "Could not connect to the platform.");
  }
  if (response.status === 404) throw new CollectorError("Company not found on this platform. Check the link or ID.");
  if (!response.ok) throw new CollectorError(`The platform answered with error ${response.status}.`);

  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new CollectorError("The platform's answer is too large.");
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new CollectorError("The platform's answer is too large.");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new CollectorError("The platform sent something that isn't valid JSON.");
  }
}

// Wait between requests so we don't hammer anyone's server.
export const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// HTML job description -> readable plain text (keeps line breaks between paragraphs and list items).
export function htmlToPlainText(html: string): string {
  const $ = cheerio.load(`<div id="root">${html}</div>`);
  $("br").replaceWith("\n");
  $("p, li, div, h1, h2, h3, h4, h5, tr").each((_i, el) => {
    $(el).append("\n");
  });
  return $("#root")
    .text()
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}
