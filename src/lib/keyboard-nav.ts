/**
 * Keyboard reachability for the chat shell (P-A11Y-1).
 *
 * A control that is painted only on hover is still in the tab order, but a
 * keyboard user cannot see it, so it is not reachable in practice. The audit
 * treats that as a miss unless focus (or focus-within on the row) reveals it.
 */

export const CONVERSATION_SKIP_TARGET_ID = "conversation";

const FOCUS_REVEAL =
  /(?:^|\s)(?:focus|focus-visible|focus-within|group-focus-within):opacity-100(?:\s|$)/;

export function hoverActionsHideKeyboardFocus(className: string): boolean {
  const hidesUntilHover =
    className.includes("opacity-0") && className.includes("group-hover:opacity-100");
  if (!hidesUntilHover) return false;
  return !FOCUS_REVEAL.test(className);
}

/** Escape dismisses a dialog or menu. Arrow keys move inside a menu, not a raw button row. */
export function dialogDismissKey(key: string): boolean {
  return key === "Escape";
}

export function menuMovesWithArrows(key: string): boolean {
  return key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End";
}

/** Escape leaves the call dialog: decline, hang up, or dismiss the ended card. */
export function callPanelDismissKey(key: string): boolean {
  return key === "Escape";
}

export function callPanelInitialAction(
  phase: "idle" | "incoming" | "outgoing" | "connecting" | "connected" | "ended",
): "accept" | "end" | "dismiss" {
  if (phase === "incoming") return "accept";
  if (phase === "ended") return "dismiss";
  return "end";
}

/** Tab cycles inside a dialog. A missing current index starts at the edge Tab would enter. */
export function nextFocusIndex(current: number, count: number, shift: boolean): number {
  if (count <= 0) return 0;
  if (current < 0) return shift ? count - 1 : 0;
  if (shift) return (current - 1 + count) % count;
  return (current + 1) % count;
}

export function themeMovesWithArrows(key: string): boolean {
  return key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";
}

export function nextTheme(current: "light" | "dark", key: string): "light" | "dark" | null {
  if (!themeMovesWithArrows(key)) return null;
  return current === "light" ? "dark" : "light";
}

