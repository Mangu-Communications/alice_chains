/**
 * P-PWA-2 — what the service worker may cache.
 *
 * The shell is the offline page, icons, and hashed build assets. Live chat
 * data stays on the network: /api (messages, avatars, files) and /socket.io
 * are never intercepted. public/sw.js must keep the same cache name, offline
 * URL, and live-data prefixes.
 */

export const SHELL_CACHE = "alisons-shell-v1";

export const OFFLINE_URL = "/offline.html";

export const PRECACHE_URLS = [
  OFFLINE_URL,
  "/favicon.svg",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

/** Paths that carry messages, files, or the socket. Never cache these. */
export function isLiveDataPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/") || pathname.startsWith("/socket.io");
}

export function isPrecachedShell(pathname: string): boolean {
  return PRECACHE_URLS.includes(pathname);
}

/** Hashed Vite assets plus the precached public shell. Not HTML, not API. */
export function isRuntimeShellAsset(pathname: string): boolean {
  return pathname.startsWith("/assets/") || isPrecachedShell(pathname);
}

/**
 * A document navigation that failed the network shows the offline page.
 * A successful navigation is not stored: a cached index would look like the
 * messenger was available with no way to load messages.
 */
export function navigationFallback(networkOk: boolean): "network" | "offline-page" {
  return networkOk ? "network" : "offline-page";
}
