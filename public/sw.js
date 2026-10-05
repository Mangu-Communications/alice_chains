/**
 * Service worker for web push (BUILD_PLAN F-6) and the P-PWA-2 offline shell.
 *
 * Served from the site root so its scope covers the whole app. Push handling
 * is unchanged. The cache holds only the offline page, icons, manifest, and
 * hashed /assets files. /api and /socket.io are never intercepted — live chat
 * data is not cached.
 *
 * Cache name and offline URL match src/lib/offline-shell.ts.
 */

const SHELL_CACHE = "alisons-shell-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/favicon.svg",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

function isLiveDataPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/") || pathname.startsWith("/socket.io");
}

function isRuntimeShellAsset(pathname) {
  return pathname.startsWith("/assets/") || PRECACHE_URLS.includes(pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("alisons-shell-") && name !== SHELL_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isLiveDataPath(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cached = await caches.match(OFFLINE_URL);
          return cached || new Response("You are offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })(),
    );
    return;
  }

  if (!isRuntimeShellAsset(url.pathname)) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(SHELL_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Alice Chains", {
      body: payload.body || "",
      // One tag per conversation, so a burst collapses into the latest rather
      // than stacking a dozen notifications for one thread.
      tag: payload.tag,
      renotify: true,
      icon: payload.icon || "/favicon.svg",
      badge: "/favicon.svg",
      // Incoming calls set this so the ring stays until the member opens it.
      requireInteraction: Boolean(payload.requireInteraction),
      data: { url: payload.url || "/chat" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/chat";

  event.waitUntil(
    (async () => {
      const open = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Focus a tab that is already open and steer it, rather than opening a
      // second copy of the app.
      for (const client of open) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }

      await clients.openWindow(target);
    })(),
  );
});
