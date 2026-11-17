"use client";

// Turn phone/browser notifications on or off for THIS browser.
// Steps when you press "Turn on":
//   1. register the service worker (public/sw.js)
//   2. the browser asks you "Allow notifications?"
//   3. the browser creates a push subscription using our server's public key
//   4. we send that subscription to the backend, which uses it to send you messages
import { useEffect, useState } from "react";
import { api } from "../lib/api";

type State = "loading" | "unsupported" | "server-off" | "blocked" | "off" | "on";

// The public key is base64url text; the browser wants raw bytes.
function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function getRegistration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

export default function NotificationSettings() {
  const [state, setState] = useState<State>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function check() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState("unsupported");
        return;
      }
      const config = await api<{ configured: boolean; publicKey: string | null }>("/api/push/config");
      if (!config.configured || !config.publicKey) {
        setState("server-off");
        return;
      }
      setPublicKey(config.publicKey);
      if (Notification.permission === "denied") {
        setState("blocked");
        return;
      }
      const registration = await getRegistration();
      const existing = await registration.pushManager.getSubscription();
      setState(existing && Notification.permission === "granted" ? "on" : "off");
    }
    check().catch((err: unknown) => {
      setMessage(err instanceof Error ? err.message : "Could not check notification settings.");
      setState("off");
    });
  }, []);

  async function turnOn() {
    if (!publicKey) return;
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const registration = await getRegistration();
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
      await api("/api/push/subscribe", { method: "POST", body: { subscription: subscription.toJSON() } });
      setState("on");
      setMessage("Notifications are on for this browser.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not turn on notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage("");
    try {
      const registration = await getRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api("/api/push/subscribe", { method: "DELETE", body: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setState("off");
      setMessage("Notifications are off for this browser.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not turn off notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ sent: number; removed: number; failed: number }>("/api/push/test", { method: "POST" });
      setMessage(
        result.sent
          ? `Test sent to ${result.sent} device${result.sent === 1 ? "" : "s"}. It should appear in a few seconds.`
          : "No device received it. Try turning notifications off and on again."
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not send the test.");
    } finally {
      setBusy(false);
    }
  }

  const buttonClass = "rounded-md px-4 py-2 disabled:opacity-50";

  return (
    <section className="border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold">Notifications on this device</h2>
      <p className="text-sm">
        Get a notification when a new job matches you (and you&apos;re not ineligible), and when a job you saved
        closes in 3 days or less.
      </p>

      {state === "loading" ? <p className="text-sm">Checking…</p> : null}
      {state === "unsupported" ? (
        <p className="text-sm text-amber-700">
          This browser can&apos;t receive notifications. On iPhone, add JobPulse to your Home Screen first.
        </p>
      ) : null}
      {state === "server-off" ? (
        <p className="text-sm text-amber-700">Notifications aren&apos;t set up on the server (VAPID keys missing in backend/.env).</p>
      ) : null}
      {state === "blocked" ? (
        <p className="text-sm text-red-600">
          Notifications are blocked for this site. Allow them in your browser&apos;s site settings (the icon left of the
          address bar), then reload.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {state === "off" ? (
          <button type="button" onClick={turnOn} disabled={busy} className={`${buttonClass} bg-blue-600 text-white`}>
            {busy ? "Turning on…" : "Turn on notifications"}
          </button>
        ) : null}
        {state === "on" ? (
          <>
            <span className="text-green-600 self-center">✓ On for this browser</span>
            <button type="button" onClick={sendTest} disabled={busy} className={`${buttonClass} border`}>
              Send test notification
            </button>
            <button type="button" onClick={turnOff} disabled={busy} className={`${buttonClass} border`}>
              Turn off
            </button>
          </>
        ) : null}
      </div>
      {message ? <p className="text-sm">{message}</p> : null}
    </section>
  );
}
