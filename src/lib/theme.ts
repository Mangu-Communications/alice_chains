/**
 * P-UX-4 — theme choice for the CSS variable swap.
 *
 * The shipped look is dark (`html.dark` plus the `.dark` token block).
 * Light is the same layout with the `:root` tokens. No stored value means
 * dark, so a first visit matches the page that shipped before this card.
 */

export const THEME_STORAGE_KEY = "alisons-theme";

export const THEMES = ["light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "dark";

/** Matches index.html meta theme-color for the default dark paint. */
export const THEME_COLORS: Record<Theme, string> = {
  dark: "#0b0b0f",
  light: "#ffffff",
};

export function parseStoredTheme(value: string | null | undefined): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

export function resolveTheme(stored: string | null | undefined): Theme {
  return parseStoredTheme(stored) ?? DEFAULT_THEME;
}

export function applyTheme(
  theme: Theme,
  root: { classList: { add: (token: string) => void; remove: (token: string) => void } },
): Theme {
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  return theme;
}
