import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OFFLINE_URL,
  PRECACHE_URLS,
  SHELL_CACHE,
  isLiveDataPath,
  isPrecachedShell,
  isRuntimeShellAsset,
  navigationFallback,
} from "./offline-shell";

describe("offline shell cache policy", () => {
  it("precaches the offline page and icons, not the API", () => {
    expect(PRECACHE_URLS).toContain(OFFLINE_URL);
    expect(PRECACHE_URLS).toContain("/favicon.svg");
    expect(PRECACHE_URLS.some((url) => url.startsWith("/api"))).toBe(false);
    expect(isPrecachedShell("/offline.html")).toBe(true);
    expect(isPrecachedShell("/")).toBe(false);
  });

  it("treats messages, files, avatars, and the socket as live data", () => {
    expect(isLiveDataPath("/api/trpc/message.list")).toBe(true);
    expect(isLiveDataPath("/api/files/download")).toBe(true);
    expect(isLiveDataPath("/api/avatar/4")).toBe(true);
    expect(isLiveDataPath("/api")).toBe(true);
    expect(isLiveDataPath("/socket.io/")).toBe(true);
    expect(isLiveDataPath("/offline.html")).toBe(false);
    expect(isLiveDataPath("/assets/index-abc.js")).toBe(false);
  });

  it("runtime-caches hashed assets and the public shell only", () => {
    expect(isRuntimeShellAsset("/assets/index-abc.js")).toBe(true);
    expect(isRuntimeShellAsset("/icons/icon-192.png")).toBe(true);
    expect(isRuntimeShellAsset("/")).toBe(false);
    expect(isRuntimeShellAsset("/chat")).toBe(false);
  });

  it("falls back to the offline page only when the navigation failed", () => {
    expect(navigationFallback(true)).toBe("network");
    expect(navigationFallback(false)).toBe("offline-page");
  });
});

describe("service worker matches the shell policy", () => {
  const sw = readFileSync(resolve("public/sw.js"), "utf8");
  const page = readFileSync(resolve("public/offline.html"), "utf8");

  it("keeps push handling and names the same cache and offline URL", () => {
    expect(sw).toContain(SHELL_CACHE);
    expect(sw).toContain(OFFLINE_URL);
    expect(sw).toContain("push");
    expect(sw).toContain("notificationclick");
    expect(sw).not.toContain("/api/trpc");
  });

  it("ships an offline page that does not pretend messages are available", () => {
    expect(page).toContain("You are offline");
    expect(page).toContain("Alisons");
    expect(page).toContain('lang="en"');
  });
});
