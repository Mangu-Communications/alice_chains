/**
 * S-0 slice 2 — display decisions that used to sit inline in the
 * conversation sidebar of `src/pages/Chat.tsx`.
 *
 * The page still owns search, selection, and the open/closed preference.
 * These helpers only decide what a row shows, so a later slice cannot
 * quietly change the online dot, the "You:" prefix, or the 99+ badge.
 */

export type SidebarLatestMessage = {
  content: string;
  senderId: number;
};

export function directPeerIsOnline(
  type: string,
  participants: readonly { userId: number }[],
  selfId: number | undefined,
  isOnline: (userId: number) => boolean,
): boolean {
  if (type !== "direct") return false;
  return participants.some((p) => p.userId !== selfId && isOnline(p.userId));
}

/**
 * Preview line. Own messages keep the "You: " prefix the sidebar used;
 * a conversation with no latest message shows the empty copy the page passed.
 */
export function conversationPreview(
  latest: SidebarLatestMessage | null,
  selfId: number | undefined,
  emptyLabel: string,
): string {
  if (!latest) return emptyLabel;
  const prefix = latest.senderId === selfId ? "You: " : "";
  return `${prefix}${latest.content}`;
}

/** Visible unread glyph. Counts above 99 stay "99+", matching the old ternary. */
export function unreadBadgeText(unreadCount: number): string {
  return unreadCount > 99 ? "99+" : String(unreadCount);
}
