import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONVERSATION_SKIP_TARGET_ID,
  hoverActionsHideKeyboardFocus,
} from "./keyboard-nav";

describe("keyboard navigation audit", () => {
  it("flags hover-only actions that focus does not reveal", () => {
    expect(
      hoverActionsHideKeyboardFocus(
        "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
      ),
    ).toBe(true);
    expect(
      hoverActionsHideKeyboardFocus(
        "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
      ),
    ).toBe(false);
    expect(
      hoverActionsHideKeyboardFocus(
        "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
      ),
    ).toBe(false);
    expect(hoverActionsHideKeyboardFocus("opacity-100")).toBe(false);
  });

  it("points the skip link at the conversation landmark", () => {
    const chat = readFileSync(resolve("src/pages/Chat.tsx"), "utf8");
    expect(chat).toContain(`id={CONVERSATION_SKIP_TARGET_ID}`);
    expect(chat).toContain("a11y.skipToConversation");
    expect(chat).toContain(`href={\`#\${CONVERSATION_SKIP_TARGET_ID}\`}`);
    expect(CONVERSATION_SKIP_TARGET_ID).toBe("conversation");
  });

  it("reveals contact row actions when the row has keyboard focus", () => {
    const contacts = readFileSync(resolve("src/pages/Contacts.tsx"), "utf8");
    expect(contacts).toContain("group-focus-within:opacity-100");
    expect(hoverActionsHideKeyboardFocus(
      "flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity",
    )).toBe(false);
  });
});
