import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONVERSATION_SKIP_TARGET_ID,
  callPanelDismissKey,
  callPanelInitialAction,
  dialogDismissKey,
  hoverActionsHideKeyboardFocus,
  menuMovesWithArrows,
  nextFocusIndex,
  nextTheme,
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

  it("treats Escape as the dialog and menu dismiss key", () => {
    expect(dialogDismissKey("Escape")).toBe(true);
    expect(dialogDismissKey("Enter")).toBe(false);
    expect(menuMovesWithArrows("ArrowDown")).toBe(true);
    expect(menuMovesWithArrows("ArrowUp")).toBe(true);
    expect(menuMovesWithArrows("Enter")).toBe(false);
  });

  it("puts reaction choices on menu items so arrows and Escape work", () => {
    const thread = readFileSync(resolve("src/pages/chat/MessageThread.tsx"), "utf8");
    const start = thread.indexOf("{REACTION_EMOJI.map");
    const end = thread.indexOf("))}", start);
    const reactionMenu = thread.slice(start, end);
    expect(reactionMenu).toContain("<DropdownMenuItem");
    expect(reactionMenu).not.toContain("<button");
    expect(thread).toContain('type="button"');
    expect(thread).toContain('if (e.key === "Escape") onCancelEdit()');
  });

  it("moves focus into the group settings dialog and does not swallow Escape", () => {
    const dialog = readFileSync(resolve("src/pages/chat/GroupSettingsDialog.tsx"), "utf8");
    expect(dialog).toContain("onOpenAutoFocus");
    expect(dialog).toContain('id="group-name"');
    expect(dialog).toContain("DialogDescription");
    expect(dialog).not.toContain("onEscapeKeyDown");
    expect(dialog).toContain("nameInputRef.current?.focus()");
  });

  it("traps focus in the call dialog and dismisses it with Escape", () => {
    expect(callPanelDismissKey("Escape")).toBe(true);
    expect(callPanelDismissKey("Enter")).toBe(false);
    expect(callPanelInitialAction("incoming")).toBe("accept");
    expect(callPanelInitialAction("connected")).toBe("end");
    expect(callPanelInitialAction("ended")).toBe("dismiss");
    expect(nextFocusIndex(1, 3, false)).toBe(2);
    expect(nextFocusIndex(0, 3, true)).toBe(2);
    expect(nextFocusIndex(-1, 2, false)).toBe(0);
    const panel = readFileSync(resolve("src/pages/chat/VoiceCallPanel.tsx"), "utf8");
    expect(panel).toContain('role="dialog"');
    expect(panel).toContain('aria-modal="true"');
    expect(panel).toContain("onDialogKeyDown");
    expect(panel).toContain('data-call-action="accept"');
    expect(panel).toContain('data-call-action="end"');
    expect(panel).toContain('data-call-action="dismiss"');
  });

  it("keeps the composer file input out of tab order and focuses the field for a reply", () => {
    const composer = readFileSync(resolve("src/pages/chat/MessageComposer.tsx"), "utf8");
    expect(composer).toContain("tabIndex={-1}");
    expect(composer).toContain('type="button"');
    expect(composer).toContain("composerRef.current?.focus()");
    expect(composer).toContain('if (e.key === "Escape" && replyingTo)');
  });

  it("moves the settings theme with arrows and saves the profile on Enter", () => {
    expect(nextTheme("light", "ArrowRight")).toBe("dark");
    expect(nextTheme("dark", "ArrowLeft")).toBe("light");
    expect(nextTheme("light", "Enter")).toBeNull();
    const settings = readFileSync(resolve("src/pages/Settings.tsx"), "utf8");
    expect(settings).toContain('role="radiogroup"');
    expect(settings).toContain("onProfileKeyDown");
    expect(settings).toContain("tabIndex={-1}");
    expect(settings).toContain("nextTheme");
  });
});

