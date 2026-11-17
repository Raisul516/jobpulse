"use client";

// Turn phone/browser notifications on or off for THIS browser.
// Steps when you press "Turn on":
//   1. the browser asks you "Allow notifications?"
//   2. register the service worker (public/sw.js)
//   3. the browser creates a push subscription with its push service, using our server's public key
//   4. we send that subscription to the backend, which uses it to send you messages
// Every step shows what it's doing, and every way it can fail shows a message — never silence.
import { useEffect, useState } from "react";
import { api } from "../lib/api";

type State = "loading" | "unsupported" | "server-off" | "blocked" | "off" | "on";

type Diagnostics = {
  browser: string;
  origin: string;
  permission: string;
  serviceWorker: string;
  subscription: string;
  server: string;
};

// The public key is base64url text; the browser wants raw bytes.
function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

// Give up on a step that hangs (e.g. a push service that never answers) instead of waiting forever.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);
}

function browserName(): string {
  const ua = navigator.userAgent;
  const brave = (navigator as Navigator & { brave?: unknown }).brave;
  if (brave) return "Brave";
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Unknown browser";
}

async function getRegistration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

export default function NotificationSettings() {
  const [state, setState] = useState<State>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(""); // what's happening right now
  const [message, setMessage] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  const [diag, setDiag] = useState<Diagnostics | null>(null);

  async function refreshDiagnostics(): Promise<void> {
    const d: Diagnostics = {
      browser: browserName(),
      origin: window.location.origin,
      permission: "Notification" in window ? Notification.permission : "not supported",
      serviceWorker: "not registered",
      subscription: "none",
      server: "not checked",
    };
    try {
      const reg = await navigator.serviceWorker?.getRegistration("/");
      if (reg) d.serviceWorker = reg.active ? "active" : reg.installing ? "installing" : "waiting";
      const sub = await reg?.pushManager.getSubscription();
      if (sub) d.subscription = new URL(sub.endpoint).hostname;
    } catch (err) {
      d.serviceWorker = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
    try {
      const body = await api<{ devices: unknown[] }>("/api/push/devices");
      d.server = `reachable, ${body.devices.length} device(s) registered`;
    } catch (err) {
      d.server = `NOT reachable: ${err instanceof Error ? err.message : String(err)}`;
    }
    setDiag(d);
  }

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
    check()
      .catch((err: unknown) => {
        setMessage({ text: `Could not check notification settings: ${err instanceof Error ? err.message : err}`, kind: "error" });
        setState("off");
      })
      .finally(() => void refreshDiagnostics());
  }, []);

  async function turnOn() {
    if (!publicKey) return;
    setBusy(true);
    setMessage(null);
    try {
      // 1. permission
      setStep("Asking your browser for permission… (if no pop-up appears, look for a bell icon in the address bar)");
      const permission = await withTimeout(
        Notification.requestPermission(),
        60_000,
        "No answer to the permission question. Click the bell / lock icon left of the address bar and allow notifications."
      );
      if (permission === "denied") {
        setState("blocked");
        throw new Error("You (or the browser) chose Block. Allow notifications in the site settings, then reload.");
      }
      if (permission !== "granted") {
        throw new Error(
          "The permission question was closed without an answer. Press the button again and choose Allow — " +
            "or click the bell / lock icon left of the address bar."
        );
      }

      // 2. service worker
      setStep("Starting the background helper (service worker)…");
      const registration = await withTimeout(getRegistration(), 15_000, "The service worker didn't start.");
      await withTimeout(navigator.serviceWorker.ready, 15_000, "The service worker didn't become ready.");

      // 3. push subscription
      setStep("Connecting to your browser's push service…");
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await withTimeout(
          registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }),
          20_000,
          "Your browser's push service didn't answer. Brave blocks it by default (Settings → Privacy → " +
            "'Use Google services for push messaging'); in Chrome, check your internet / VPN / firewall."
        ));

      // 4. tell the server
      setStep("Saving this browser on the JobPulse server…");
      await api("/api/push/subscribe", { method: "POST", body: { subscription: subscription.toJSON() } });

      setState("on");
      setMessage({ text: "Notifications are on for this browser. Press “Send test notification” to check.", kind: "ok" });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Could not turn on notifications.", kind: "error" });
    } finally {
      setStep("");
      setBusy(false);
      void refreshDiagnostics();
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await getRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api("/api/push/subscribe", { method: "DELETE", body: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setState("off");
      setMessage({ text: "Notifications are off for this browser.", kind: "ok" });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Could not turn off notifications.", kind: "error" });
    } finally {
      setBusy(false);
      void refreshDiagnostics();
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<{ sent: number; removed: number; failed: number }>("/api/push/test", { method: "POST" });
      setMessage(
        result.sent
          ? {
              text:
                `Sent to ${result.sent} device${result.sent === 1 ? "" : "s"}. If nothing pops up within a few seconds, ` +
                "use “Show a local test” below to check whether Windows shows Chrome notifications at all.",
              kind: "ok",
            }
          : { text: "No device received it. Turn notifications off and on again.", kind: "error" }
      );
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Could not send the test.", kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  // Shows a notification straight from this page, without the server or push service.
  // If THIS doesn't appear, the problem is the computer's notification settings, not JobPulse.
  async function localTest() {
    setMessage(null);
    try {
      if (Notification.permission !== "granted") throw new Error("Allow notifications first.");
      const registration = await getRegistration();
      await registration.showNotification("JobPulse local test", {
        body: "If you can see this, your browser and computer show notifications fine.",
        icon: "/icon-192.png",
        tag: "local-test",
      });
      setMessage({
        text:
          "Local test shown. Didn't see it? In Windows: Settings → System → Notifications → turn on notifications for " +
          "your browser, and turn off Do not disturb / Focus.",
        kind: "ok",
      });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Could not show the local test.", kind: "error" });
    }
  }


  return (
    <section className="card p-5 space-y-3">
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
          Notifications are blocked for this site. Click the lock / settings icon left of the address bar →
          Notifications → Allow, then reload this page.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {state === "off" ? (
          <button type="button" onClick={turnOn} disabled={busy} className="btn btn-primary">
            {busy ? "Working…" : "Turn on notifications"}
          </button>
        ) : null}
        {state === "on" ? (
          <>
            <span className="text-emerald-600 dark:text-emerald-400 self-center">✓ On for this browser</span>
            <button type="button" onClick={sendTest} disabled={busy} className="btn btn-secondary btn-sm">
              Send test notification
            </button>
            <button type="button" onClick={localTest} disabled={busy} className="btn btn-secondary btn-sm">
              Show a local test
            </button>
            <button type="button" onClick={turnOff} disabled={busy} className="btn btn-secondary btn-sm">
              Turn off
            </button>
          </>
        ) : null}
      </div>

      {step ? <p className="text-sm text-blue-600">{step}</p> : null}
      {message ? (
        <p className={`alert ${message.kind === "ok" ? "alert-success" : "alert-error"}`}>
          {message.text}
        </p>
      ) : null}

      {diag ? (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Diagnostics (share this if it doesn&apos;t work)</summary>
          <ul className="mt-1 space-y-0.5 font-mono">
            <li>browser: {diag.browser}</li>
            <li>page address: {diag.origin}</li>
            <li>permission: {diag.permission}</li>
            <li>service worker: {diag.serviceWorker}</li>
            <li>push subscription: {diag.subscription}</li>
            <li>server: {diag.server}</li>
          </ul>
        </details>
      ) : null}
    </section>
  );
}
