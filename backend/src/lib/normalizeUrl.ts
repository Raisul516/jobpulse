// Turns different-looking links to the SAME page into one standard form,
// so we can tell when a link was already imported.
//   https://WWW.Example.com/jobs/12/?utm_source=fb#apply  ->  https://www.example.com/jobs/12

// Tracking parameters that don't change which page you get.
const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|igshid)$/i;

export function normalizeUrl(input: string): string {
  const url = new URL(input.trim());
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();

  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }

  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.test(key))
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = new URLSearchParams(kept).toString();

  // "/jobs/12/" and "/jobs/12" are the same page on almost every site.
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}
