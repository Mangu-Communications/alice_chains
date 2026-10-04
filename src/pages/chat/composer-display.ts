/**
 * S-0 slice 4 — composer copy and send-gate decisions extracted from Chat.tsx.
 *
 * The page still owns the draft, the outbox, and the socket. These helpers
 * only name the same strings and the same disabled rule the markup used.
 */
export const COMPOSER_MAX_HEIGHT = 120;

export function replyTargetName(senderName: string | null | undefined): string {
  return senderName || "Unknown";
}

export function composerAriaLabel(replying: boolean, senderName: string | null | undefined): string {
  return replying
    ? `Reply to ${senderName || "message"}`
    : "Type a message";
}

export function composerPlaceholder(replying: boolean): string {
  return replying ? "Type your reply..." : "Type a message...";
}

export function sendDisabled(value: string, over: boolean): boolean {
  return !value.trim() || over;
}
