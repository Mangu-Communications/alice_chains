/**
 * S-0 slice 3 — display decisions that used to sit inline in the
 * message log of `src/pages/Chat.tsx`.
 *
 * The page still owns the query, edit draft, reactions, and the outbox.
 * These helpers only decide what a row shows, so a later slice cannot
 * quietly change grouping, the reply label, or the pending-send copy.
 */

/** Avatar on the first message of a run from someone else. Own rows never show one. */
export function showSenderAvatar(
  isMine: boolean,
  index: number,
  previousSenderId: number | undefined,
  senderId: number,
): boolean {
  return !isMine && (index === 0 || previousSenderId !== senderId);
}

/** Top margin when the sender changes, including the first row. */
export function isFirstInSenderGroup(
  index: number,
  previousSenderId: number | undefined,
  senderId: number,
): boolean {
  return index === 0 || previousSenderId !== senderId;
}

/** Reply chip author. Own replies stay "You"; a missing name stays "Unknown". */
export function replyAuthorLabel(
  replyToSenderId: number | null | undefined,
  selfId: number | undefined,
  replyToSenderName: string | null | undefined,
): string {
  return replyToSenderId === selfId ? "You" : replyToSenderName || "Unknown";
}

/** Reply chip body. A deleted parent keeps the old "Message deleted" copy. */
export function replyPreviewText(
  replyToDeletedAt: unknown,
  replyToContent: string | null | undefined,
): string {
  return replyToDeletedAt ? "Message deleted" : replyToContent ?? "";
}

/** Double-check only when at least one receipt exists. */
export function receiptIsRead(readByLength: number): boolean {
  return readByLength > 0;
}

/** Queued-send caption. Connected stays "Sending…"; offline stays "Waiting to send". */
export function pendingSendLabel(socketConnected: boolean): string {
  return socketConnected ? "Sending…" : "Waiting to send";
}
