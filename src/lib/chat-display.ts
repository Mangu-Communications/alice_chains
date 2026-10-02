/**
 * S-0 slice 1 — pure display decisions lifted out of `src/pages/Chat.tsx`.
 *
 * Chat.tsx stays the page. These helpers must match the previous inline
 * expressions exactly, including the falsy cases (missing display name,
 * empty search, direct-only peer lookup).
 */

/**
 * Avatar letter. Sidebar and member rows use "?" when the name is missing.
 * The conversation header previously rendered an empty string instead, so
 * the fallback is an argument.
 */
export function avatarInitial(
  displayName: string | null | undefined,
  fallback = "?",
): string {
  return displayName?.charAt(0).toUpperCase() || fallback;
}

/**
 * Conversation-list name filter. A missing display name does not match,
 * even when the query is empty — that is what optional chaining returned.
 */
export function conversationMatchesQuery(
  displayName: string | null | undefined,
  query: string,
): boolean {
  return displayName?.toLowerCase().includes(query.toLowerCase()) ?? false;
}

/**
 * The other member of a direct conversation, or null for groups.
 * A missing self id matches the old `user?.id` expression: the first
 * participant whose id is not undefined, not a forced null.
 */
export function otherDirectMemberId(
  type: string | undefined,
  participants: readonly { userId: number }[] | undefined,
  selfId: number | undefined,
): number | null {
  if (type !== "direct") return null;
  return participants?.find((p) => p.userId !== selfId)?.userId ?? null;
}

export function isGroupOwner(
  type: string | undefined,
  createdBy: number | null | undefined,
  selfId: number | undefined,
): boolean {
  return type === "group" && createdBy === selfId;
}

/** Contacts who are not already participants. Used by the add-member dialog. */
export function contactsNotInConversation<T extends { contactUserId: number }>(
  contacts: readonly T[],
  participants: readonly { userId: number }[] | undefined,
): T[] {
  return contacts.filter(
    (contact) => !participants?.some((p) => p.userId === contact.contactUserId),
  );
}
