/**
 * S-0 slice 4 — pins the composer decisions extracted from Chat.tsx.
 */
import { describe, expect, it } from "vitest";
import {
  COMPOSER_MAX_HEIGHT,
  composerAriaLabel,
  composerPlaceholder,
  replyTargetName,
  sendDisabled,
} from "./composer-display";

describe("replyTargetName", () => {
  it("falls back to Unknown when the sender name is missing", () => {
    expect(replyTargetName(null)).toBe("Unknown");
    expect(replyTargetName("")).toBe("Unknown");
    expect(replyTargetName("Ada")).toBe("Ada");
  });
});

describe("composerAriaLabel", () => {
  it("names the reply target and otherwise the plain field", () => {
    expect(composerAriaLabel(true, "Ada")).toBe("Reply to Ada");
    expect(composerAriaLabel(true, null)).toBe("Reply to message");
    expect(composerAriaLabel(false, "Ada")).toBe("Type a message");
  });
});

describe("composerPlaceholder", () => {
  it("switches copy only while a reply is in progress", () => {
    expect(composerPlaceholder(true)).toBe("Type your reply...");
    expect(composerPlaceholder(false)).toBe("Type a message...");
  });
});

describe("sendDisabled", () => {
  it("blocks an empty draft and a draft over the cap", () => {
    expect(sendDisabled("  ", false)).toBe(true);
    expect(sendDisabled("hello", true)).toBe(true);
    expect(sendDisabled("hello", false)).toBe(false);
  });
});

describe("COMPOSER_MAX_HEIGHT", () => {
  it("matches the max-h-[120px] class on the field", () => {
    expect(COMPOSER_MAX_HEIGHT).toBe(120);
  });
});
