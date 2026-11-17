// Notifications API.
//   GET    /api/push/config        -> public key + whether push is set up
//   GET    /api/push/devices       -> devices with notifications on
//   POST   /api/push/subscribe     { subscription }  -> turn on for this browser
//   DELETE /api/push/subscribe     { endpoint }      -> turn off for this browser
//   POST   /api/push/test          -> send a test notification to all your devices
//   POST   /api/push/run           -> check for new matches / deadlines now
import { Router } from "express";
import { z } from "zod";
import { currentUserId } from "../lib/currentUser";
import { runNotifier } from "../lib/notifier";
import {
  isAllowedEndpoint,
  listSubscriptions,
  pushConfigured,
  removeSubscription,
  saveSubscription,
  sendToUser,
  vapidPublicKey,
} from "../lib/push";

export const pushRouter = Router();

const subscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().max(2000).refine(isAllowedEndpoint, "Not a known browser push service"),
    keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
  }),
});

const endpointSchema = z.object({ endpoint: z.string().max(2000) });

pushRouter.get("/config", (_req, res) => {
  res.json({ configured: pushConfigured, publicKey: vapidPublicKey || null });
});

pushRouter.get("/devices", async (_req, res) => {
  const devices = await listSubscriptions(await currentUserId());
  // never send the full endpoint/keys back; a short id is enough to tell devices apart
  res.json({
    devices: devices.map((d) => ({
      id: d.id,
      endpointEnd: d.endpoint.slice(-12),
      userAgent: d.userAgent,
      createdAt: d.createdAt,
      lastSuccessAt: d.lastSuccessAt,
    })),
  });
});

pushRouter.post("/subscribe", async (req, res) => {
  if (!pushConfigured) {
    res.status(503).json({ error: "Notifications aren't set up on the server (VAPID keys missing)." });
    return;
  }
  const parsed = subscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid subscription" });
    return;
  }
  const { endpoint, keys } = parsed.data.subscription;
  await saveSubscription(await currentUserId(), { endpoint, p256dh: keys.p256dh, auth: keys.auth }, req.get("user-agent")?.slice(0, 300) ?? null);
  res.status(201).json({ ok: true });
});

pushRouter.delete("/subscribe", async (req, res) => {
  const parsed = endpointSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "endpoint is required" });
    return;
  }
  await removeSubscription(parsed.data.endpoint);
  res.status(204).end();
});

pushRouter.post("/test", async (_req, res) => {
  const result = await sendToUser(await currentUserId(), {
    title: "JobPulse notifications work 🎉",
    body: "You'll get a message like this when a new job matches you, or a saved job's deadline is close.",
    url: "/",
    tag: "test",
  });
  res.json(result);
});

pushRouter.post("/run", async (_req, res) => {
  res.json(await runNotifier());
});
