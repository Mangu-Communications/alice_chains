/**
 * P-A11Y-3 — WCAG 2.1 AA contrast for normal text (NFR-A11Y-04).
 *
 * Relative luminance follows the sRGB formula in WCAG 2.1. The 4.5:1 floor
 * is for normal text. Large text and non-text UI (3:1) are out of this card.
 */

export const NORMAL_TEXT_CONTRAST = 4.5;

export type Hsl = { h: number; s: number; l: number };

export function parseHsl(value: string): Hsl {
  const match = value.trim().match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!match) throw new Error(`Not an HSL token: ${value}`);
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

function channel(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function hslToRgb(hsl: Hsl): [number, number, number] {
  const h = hsl.h;
  const s = hsl.s / 100;
  const l = hsl.l / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [chroma, x, 0];
  else if (h < 120) [r, g, b] = [x, chroma, 0];
  else if (h < 180) [r, g, b] = [0, chroma, x];
  else if (h < 240) [r, g, b] = [0, x, chroma];
  else if (h < 300) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];
  return [r + m, g + m, b + m];
}

export function relativeLuminance(hsl: Hsl): number {
  const [r, g, b] = hslToRgb(hsl);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: Hsl, background: Hsl): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

/** Foreground token on background token. Both themes must clear 4.5:1. */
export const NORMAL_TEXT_PAIRS = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["muted-foreground", "background"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "card"],
  ["accent-foreground", "accent"],
  ["destructive-foreground", "destructive"],
  ["destructive", "background"],
  ["primary", "background"],
  ["primary", "card"],
  ["sidebar-foreground", "sidebar-background"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ["sidebar-accent-foreground", "sidebar-accent"],
] as const;

export function readTokenBlock(css: string, selector: ":root" | ".dark"): Record<string, Hsl> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing ${selector} token block`);
  const end = css.indexOf("}", start);
  const body = css.slice(start, end);
  const tokens: Record<string, Hsl> = {};
  for (const match of body.matchAll(/--([a-z0-9-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g)) {
    tokens[match[1]] = { h: Number(match[2]), s: Number(match[3]), l: Number(match[4]) };
  }
  return tokens;
}
