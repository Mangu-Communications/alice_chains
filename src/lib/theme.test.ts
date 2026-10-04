import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  THEME_COLORS,
  applyTheme,
  parseStoredTheme,
  resolveTheme,
} from "./theme";

describe("resolveTheme", () => {
  it("keeps the shipped dark look when nothing is stored", () => {
    expect(resolveTheme(null)).toBe(DEFAULT_THEME);
    expect(resolveTheme(undefined)).toBe("dark");
    expect(resolveTheme("")).toBe("dark");
    expect(resolveTheme("system")).toBe("dark");
  });

  it("accepts only the two CSS token themes", () => {
    expect(parseStoredTheme("light")).toBe("light");
    expect(parseStoredTheme("dark")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });
});

describe("applyTheme", () => {
  it("swaps the dark class without touching layout", () => {
    const classes = new Set<string>(["dark"]);
    const root = {
      classList: {
        add: (token: string) => classes.add(token),
        remove: (token: string) => classes.delete(token),
      },
    };

    expect(applyTheme("light", root)).toBe("light");
    expect(classes.has("dark")).toBe(false);
    expect(applyTheme("dark", root)).toBe("dark");
    expect(classes.has("dark")).toBe(true);
    expect(THEME_COLORS.dark).toBe("#0b0b0f");
    expect(THEME_COLORS.light).toBe("#ffffff");
  });
});
