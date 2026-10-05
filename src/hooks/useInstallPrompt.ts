/**
 * P-PWA-1 — capture beforeinstallprompt and decide whether to offer install.
 */
import { useCallback, useEffect, useState } from "react";
import {
  INSTALL_DISMISS_KEY,
  installBannerKind,
  isInstalledDisplay,
  isIosBrowser,
  shouldShowInstallBanner,
} from "@/lib/install-prompt";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function readDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function readInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const displayMode = window.matchMedia?.("(display-mode: standalone)").matches
    ? "standalone"
    : "browser";
  const iosStandalone = Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone,
  );
  return isInstalledDisplay(displayMode, iosStandalone);
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [installed, setInstalled] = useState(readInstalled);
  const iosBrowser = typeof navigator !== "undefined" && isIosBrowser(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return "unavailable" as const;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    if (choice.outcome === "accepted") setInstalled(true);
    return choice.outcome;
  }, [deferred]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, "1");
    } catch {
      // Private mode can block storage; the banner still hides this visit.
    }
  }, []);

  const hasDeferredPrompt = deferred !== null;
  return {
    installed,
    show: shouldShowInstallBanner({
      installed,
      dismissed,
      hasDeferredPrompt,
      iosBrowser,
    }),
    kind: installBannerKind({ hasDeferredPrompt, iosBrowser }),
    install,
    dismiss,
  };
}
