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
