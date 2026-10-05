import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  INSTALL_DISMISS_KEY,
  MANIFEST_PATH,
  installBannerKind,
  isInstalledDisplay,
  isIosBrowser,
  shouldShowInstallBanner,
} from "./install-prompt";

describe("install display", () => {
  it("treats standalone and fullscreen as already installed", () => {
    expect(isInstalledDisplay("standalone", false)).toBe(true);
    expect(isInstalledDisplay("fullscreen", false)).toBe(true);
    expect(isInstalledDisplay("browser", true)).toBe(true);
    expect(isInstalledDisplay("browser", false)).toBe(false);
    expect(isInstalledDisplay(null, false)).toBe(false);
  });

  it("recognises iOS user agents that cannot fire beforeinstallprompt", () => {
    expect(isIosBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)")).toBe(true);
    expect(isIosBrowser("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(true);
    expect(isIosBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(false);
  });
});

describe("shouldShowInstallBanner", () => {
  it("shows a Chromium prompt only while the deferred event is held", () => {
    expect(
      shouldShowInstallBanner({
        installed: false,
        dismissed: false,
        hasDeferredPrompt: true,
        iosBrowser: false,
      }),
    ).toBe(true);
    expect(installBannerKind({ hasDeferredPrompt: true, iosBrowser: false })).toBe("prompt");
  });

  it("shows an iOS add-to-home-screen hint when no prompt event exists", () => {
    expect(
      shouldShowInstallBanner({
        installed: false,
        dismissed: false,
        hasDeferredPrompt: false,
        iosBrowser: true,
      }),
    ).toBe(true);
    expect(installBannerKind({ hasDeferredPrompt: false, iosBrowser: true })).toBe("ios-hint");
  });

  it("stays quiet once installed, dismissed, or on a desktop browser with no event", () => {
    expect(
      shouldShowInstallBanner({
        installed: true,
        dismissed: false,
        hasDeferredPrompt: true,
        iosBrowser: true,
      }),
    ).toBe(false);
    expect(
      shouldShowInstallBanner({
        installed: false,
        dismissed: true,
        hasDeferredPrompt: true,
        iosBrowser: false,
      }),
    ).toBe(false);
    expect(
      shouldShowInstallBanner({
        installed: false,
        dismissed: false,
        hasDeferredPrompt: false,
        iosBrowser: false,
      }),
    ).toBe(false);
    expect(installBannerKind({ hasDeferredPrompt: false, iosBrowser: false })).toBe("none");
    expect(INSTALL_DISMISS_KEY).toBe("alisons-install-dismissed");
  });
});

describe("web app manifest", () => {
  it("declares a standalone home-screen install for Alisons", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "public/manifest.webmanifest"), "utf8"),
    );
    expect(MANIFEST_PATH).toBe("/manifest.webmanifest");
    expect(manifest.name).toBe("Alisons");
    expect(manifest.short_name).toBe("Alisons");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#0b0b0f");
    expect(manifest.background_color).toBe("#0b0b0f");
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(
      true,
    );
  });
});
