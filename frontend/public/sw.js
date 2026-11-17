// JobPulse service worker: a small script the browser keeps running in the background,
// even when no JobPulse tab is open. It receives push messages and shows them as notifications.

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json(); // { title, body, url, tag } sent by backend/src/lib/push.ts
  } catch {
    data = { title: "JobPulse", body: event.data.text(), url: "/" };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "JobPulse", {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag, // same tag = replace the older notification instead of stacking
      data: { url: data.url || "/" },
    })
  );
});

// Tapping the notification opens (or focuses) JobPulse at the right page.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
