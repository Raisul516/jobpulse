import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./normalizeUrl";
import { fetchPage, FetchPageError, isBlockedIp } from "./safeFetch";

describe("normalizeUrl", () => {
  it("removes tracking, fragments, trailing slashes and default ports", () => {
    expect(normalizeUrl("https://WWW.Example.com:443/jobs/12/?utm_source=fb&fbclid=abc#apply")).toBe(
      "https://www.example.com/jobs/12"
    );
  });

  it("keeps real query parameters, sorted", () => {
    expect(normalizeUrl("https://example.com/job?b=2&id=7&a=1")).toBe("https://example.com/job?a=1&b=2&id=7");
  });
});

describe("isBlockedIp", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.5", "192.168.0.157", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])(
    "blocks %s",
    (ip) => expect(isBlockedIp(ip)).toBe(true)
  );

  it.each(["8.8.8.8", "103.4.145.1", "2606:4700::1111"])("allows public %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });
});

describe("fetchPage refuses unsafe links", () => {
  it.each([
    "http://localhost:4000/api/health",
    "http://127.0.0.1:5433",
    "http://[::1]/",
    "http://192.168.0.1/admin",
    "file:///C:/Windows/win.ini",
    "http://user:pass@example.com/",
  ])("%s", async (url) => {
    await expect(fetchPage(url)).rejects.toBeInstanceOf(FetchPageError);
  });
});
