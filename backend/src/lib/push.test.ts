import { describe, expect, it } from "vitest";
import { isAllowedEndpoint } from "./push";

describe("isAllowedEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc123",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
    "https://web.push.apple.com/QGuQyavXutnMH",
  ])("accepts real push service %s", (url) => {
    expect(isAllowedEndpoint(url)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc", // not https
    "https://localhost:5433/evil",
    "https://127.0.0.1:4100/device",
    "https://192.168.0.1/admin",
    "https://fcm.googleapis.com.evil.example/x", // look-alike domain
    "https://evil.example/fcm.googleapis.com",
    "not a url",
  ])("rejects %s", (url) => {
    expect(isAllowedEndpoint(url)).toBe(false);
  });
});
