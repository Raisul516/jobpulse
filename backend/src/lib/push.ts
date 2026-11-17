// Sending Web Push notifications.
//
// How it works: when you allow notifications, your browser gives us an "endpoint" URL on its push
// service (Google for Chrome/Android, Mozilla for Firefox, Apple for Safari, Microsoft for Edge)
// plus two keys. We encrypt a small message with those keys and POST it to the endpoint; the push
// service delivers it to your device even when JobPulse isn't open.
import { eq, sql } from "drizzle-orm";
// web-push v4 only has named exports (no default), so import the whole module
import * as webpush from "web-push";
import { db } from "../db/client";
import { pushSubscriptions } from "../db/schema";

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@jobpulse.local";

export const pushConfigured = Boolean(PUBLIC_KEY && PRIVATE_KEY);
if (pushConfigured) webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);

export const vapidPublicKey = PUBLIC_KEY;

// Only real browser push services. The server POSTs to whatever endpoint is stored, so accepting
// any URL would let someone make it call addresses inside your network (SSRF).
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
];

export function isAllowedEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

export type PushMessage = {
  title: string;
  body: string;
  url: string; // opened when you tap the notification
  tag?: string; // same tag replaces an older notification instead of stacking
};

export async function saveSubscription(
  userId: number,
  sub: { endpoint: string; p256dh: string; auth: string },
  userAgent: string | null
) {
  await db
    .insert(pushSubscriptions)
    .values({ userId, ...sub, userAgent })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.p256dh, auth: sub.auth, userAgent } });
}

export async function removeSubscription(endpoint: string): Promise<boolean> {
  const rows = await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).returning({ id: pushSubscriptions.id });
  return rows.length > 0;
}

export async function listSubscriptions(userId: number) {
  return db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      userAgent: pushSubscriptions.userAgent,
      createdAt: pushSubscriptions.createdAt,
      lastSuccessAt: pushSubscriptions.lastSuccessAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
}

export type SendResult = { sent: number; removed: number; failed: number };

// Send to every device of this user. Devices that unsubscribed (404/410) are cleaned up.
export async function sendToUser(userId: number, message: PushMessage): Promise<SendResult> {
  const result: SendResult = { sent: 0, removed: 0, failed: 0 };
  if (!pushConfigured) return result;

  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(message),
        { TTL: 24 * 60 * 60 } // the push service keeps it up to a day if the device is offline
      );
      await db.update(pushSubscriptions).set({ lastSuccessAt: sql`now()` }).where(eq(pushSubscriptions.id, sub.id));
      result.sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // the browser unsubscribed or the subscription expired
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        result.removed++;
      } else {
        console.error(`[push] send failed (${status ?? "network"}):`, (err as Error).message);
        result.failed++;
      }
    }
  }
  return result;
}
