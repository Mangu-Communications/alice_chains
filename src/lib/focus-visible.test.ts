import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, readTokenBlock } from "./contrast";

/**
 * P-A11Y-4 — keyboard focus must be visible (WCAG 2.4.7 / non-text 3:1).
 * The rule is unlayered so it is not wiped by Tailwind's transparent outline.
 */
const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const FOCUS_INDICATOR_CONTRAST = 3;

describe("P-A11Y-4 focus-visible indicators", () => {
  it("paints a 2px ring token outline on :focus-visible", () => {
    const rule = css.match(/:focus-visible\s*\{[^}]+\}/);
    expect(rule, "missing unlayered :focus-visible rule").not.toBeNull();
    expect(rule?.[0]).toMatch(/outline:\s*2px solid hsl\(var\(--ring\)\)/);
    expect(rule?.[0]).toMatch(/outline-offset:\s*2px/);
    expect(css.indexOf(":focus-visible {")).toBeGreaterThan(css.lastIndexOf("@layer"));
  });

  it("ring token clears 3:1 against the page background in both themes", () => {
    const failures = [":root", ".dark"].flatMap((theme) => {
      const tokens = readTokenBlock(css, theme as ":root" | ".dark");
      const ring = tokens.ring;
      const background = tokens.background;
      if (!ring || !background) return [`${theme}: missing ring or background`];
      const ratio = contrastRatio(ring, background);
      return ratio + 1e-9 < FOCUS_INDICATOR_CONTRAST
        ? [`${theme} ring on background: ${ratio.toFixed(2)}`]
        : [];
    });
    expect(failures).toEqual([]);
  });
});
