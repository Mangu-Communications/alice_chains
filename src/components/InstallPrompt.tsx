/**
 * P-PWA-1 — dismissible home-screen install offer.
 *
 * Chromium gets the deferred prompt. iOS gets the add-to-home-screen steps,
 * because Safari does not fire beforeinstallprompt. Offline caching is P-PWA-2.
 */
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

export function InstallPromptBanner() {
  const { show, kind, install, dismiss } = useInstallPrompt();
  if (!show) return null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card/60 text-sm"
      role="region"
      aria-label="Install Alisons"
    >
      <p className="flex-1 min-w-0 text-muted-foreground">
        {kind === "ios-hint"
          ? "Add Alisons to your home screen from the Share menu, then Add to Home Screen."
          : "Install Alisons on this device for a home-screen app."}
      </p>
      {kind === "prompt" && (
        <Button type="button" size="sm" onClick={() => void install()}>
          Install
        </Button>
      )}
      <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
        Not now
      </Button>
    </div>
  );
}

export function InstallPromptSettings() {
  const { installed, kind, install } = useInstallPrompt();

  return (
    <section className="space-y-3 pt-4 border-t border-border">
      <h2 className="text-sm font-semibold">Home screen</h2>
      {installed ? (
        <p className="text-xs text-muted-foreground">Alisons is already installed on this device.</p>
      ) : kind === "prompt" ? (
        <>
          <p className="text-xs text-muted-foreground">
            Install opens the browser prompt. The app stays this site; it does not add a store listing.
          </p>
          <Button type="button" variant="secondary" onClick={() => void install()}>
            Install Alisons
          </Button>
        </>
      ) : kind === "ios-hint" ? (
        <p className="text-xs text-muted-foreground">
          On iPhone or iPad, open the Share menu and choose Add to Home Screen. Push on iOS needs that install.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          This browser has not offered install yet. Chrome and Edge show it once the manifest is eligible.
        </p>
      )}
    </section>
  );
}
