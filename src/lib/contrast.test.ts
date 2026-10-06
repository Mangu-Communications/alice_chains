import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  NORMAL_TEXT_CONTRAST,
  NORMAL_TEXT_PAIRS,
  contrastRatio,
  readTokenBlock,
} from "./contrast";

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");

describe("P-A11Y-3 normal text contrast", () => {
  for (const theme of [":root", ".dark"] as const) {
    it(`${theme} text pairs clear WCAG AA 4.5:1`, () => {
      const tokens = readTokenBlock(css, theme);
      const failures = NORMAL_TEXT_PAIRS.flatMap(([foreground, background]) => {
        const fg = tokens[foreground];
        const bg = tokens[background];
        if (!fg || !bg) return [`${foreground} on ${background}: missing token`];
        const ratio = contrastRatio(fg, bg);
        return ratio + 1e-9 < NORMAL_TEXT_CONTRAST
          ? [`${foreground} on ${background}: ${ratio.toFixed(2)}`]
          : [];
      });
      expect(failures).toEqual([]);
    });
  }
});
