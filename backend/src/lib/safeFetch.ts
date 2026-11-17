// Downloads a web page that the USER pasted, safely.
//
// Why "safely"? The server fetches whatever URL it is given. Without checks, a link like
// http://localhost:5433 or http://192.168.0.1/admin would make our server read things
// on our own computer or home network (an attack called SSRF). So we:
//   1. allow only http/https,
//   2. look up the site's IP address and refuse private/local addresses,
//   3. follow redirects ourselves and check every hop again,
//   4. stop after a time limit and a size limit.
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB is plenty for a job page
const MAX_REDIRECTS = 5;
const USER_AGENT = "JobPulse/0.1 (personal job tracker; fetches a single page when its user pastes a link)";

const blocked = new BlockList();
// IPv4 private / local / special ranges
blocked.addSubnet("0.0.0.0", 8);
blocked.addSubnet("10.0.0.0", 8);
blocked.addSubnet("100.64.0.0", 10);
blocked.addSubnet("127.0.0.0", 8);
blocked.addSubnet("169.254.0.0", 16);
blocked.addSubnet("172.16.0.0", 12);
blocked.addSubnet("192.168.0.0", 16);
blocked.addSubnet("198.18.0.0", 15);
blocked.addSubnet("224.0.0.0", 4);
blocked.addSubnet("240.0.0.0", 4);
// IPv6 equivalents
blocked.addAddress("::", "ipv6");
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6"); // private
blocked.addSubnet("fe80::", 10, "ipv6"); // link-local
blocked.addSubnet("ff00::", 8, "ipv6"); // multicast
// IPv4 written as IPv6 (::ffff:1.2.3.4) is unwrapped and checked as IPv4 in isBlockedIp.
// Don't add ::ffff:0:0/96 here: Node then matches EVERY IPv4 address against it.

export class FetchPageError extends Error {}

export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return blocked.check(ip, "ipv4");
  if (version === 6) {
    const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blocked.check(mapped[1], "ipv4");
    return blocked.check(ip, "ipv6");
  }
  return true; // not an IP at all -> refuse
}

async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchPageError("Only http and https links are supported.");
  }
  if (url.username || url.password) {
    throw new FetchPageError("Links with a username or password are not supported.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, ""); // [::1] -> ::1
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw new FetchPageError(`Could not find the website "${url.hostname}".`);
  }
  if (addresses.length === 0 || addresses.some(isBlockedIp)) {
    throw new FetchPageError("This link points to a private or local address, which JobPulse does not open.");
  }
}

// Read the body but stop once it gets too big.
async function readLimited(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new FetchPageError("The page is too large to read.");
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

export type FetchedPage = { finalUrl: string; html: string };

export async function fetchPage(rawUrl: string): Promise<FetchedPage> {
  let url = new URL(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(url);

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual", // we follow redirects ourselves so each one is checked
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      throw new FetchPageError(timedOut ? "The website took too long to answer." : "Could not connect to the website.");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new FetchPageError("The website sent a broken redirect.");
      url = new URL(location, url);
      continue;
    }

    if (!response.ok) {
      throw new FetchPageError(`The website answered with error ${response.status}.`);
    }

    const type = response.headers.get("content-type") ?? "";
    if (type.includes("application/pdf")) {
      throw new FetchPageError("This link is a PDF. PDF circulars are not supported yet — please fill the details by hand.");
    }
    if (type && !type.includes("html") && !type.includes("xml") && !type.includes("text/plain")) {
      throw new FetchPageError(`This link is not a web page (${type.split(";")[0]}).`);
    }

    return { finalUrl: url.toString(), html: await readLimited(response) };
  }

  throw new FetchPageError("Too many redirects.");
}
