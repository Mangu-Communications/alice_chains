/**
 * P-PWA-1 — when to offer a home-screen install.
 *
 * Chromium fires `beforeinstallprompt`. iOS Safari never does; a short
 * add-to-home-screen hint is the install prompt there. Already-installed
 * (standalone / fullscreen) and a dismissed banner stay quiet.
 */

export const INSTALL_DISMISS_KEY = "alisons-install-dismissed";

export const MANIFEST_PATH = "/manifest.webmanifest";

export function isInstalledDisplay(
  displayMode: string | null | undefined,
  iosStandalone: boolean,
): boolean {
  return displayMode === "standalone" || displayMode === "fullscreen" || iosStandalone;
}

/** iOS browsers do not emit beforeinstallprompt. Chrome-on-iOS included. */
export function isIosBrowser(userAgent: string): boolean {
  return /iPad|iPhone|iPod/.test(userAgent);
}

export function shouldShowInstallBanner(input: {
  installed: boolean;
  dismissed: boolean;
  hasDeferredPrompt: boolean;
  iosBrowser: boolean;
}): boolean {
  if (input.installed || input.dismissed) return false;
  return input.hasDeferredPrompt || input.iosBrowser;
}

export function installBannerKind(input: {
  hasDeferredPrompt: boolean;
  iosBrowser: boolean;
}): "prompt" | "ios-hint" | "none" {
  if (input.hasDeferredPrompt) return "prompt";
  if (input.iosBrowser) return "ios-hint";
  return "none";
}
