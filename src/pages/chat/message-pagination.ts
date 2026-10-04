/**
 * H-9 — cursor window for the message log.
 *
 * The first page is still the latest `MESSAGE_PAGE_SIZE` messages (no cursor).
 * Older pages ask for ids strictly below the oldest id already loaded, which
 * matches `message.listByConversation`'s `cursor` input. Pages arrive newest
 * first; the log renders oldest first.
 */

export const MESSAGE_PAGE_SIZE = 50;

/** Exclusive cursor for the next older page, or undefined when this page is short. */
export function nextOlderCursor(
  page: readonly { id: number }[],
  pageSize = MESSAGE_PAGE_SIZE
): number | undefined {
  if (page.length < pageSize || page.length === 0) return undefined;
  return page.reduce((oldest, row) => (row.id < oldest ? row.id : oldest), page[0].id);
}

/** Newest page first, as `useInfiniteQuery` returns them. Log order is oldest first. */
export function flattenMessagePages<T>(pages: readonly (readonly T[])[]): T[] {
  return [...pages].reverse().flat();
}
