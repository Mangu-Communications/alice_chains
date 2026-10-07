/**
 * A1-006. Context assembly (MASTER §7.6 step 1).
 *
 * Loads the last ALICE_CONTEXT_MESSAGES messages in a conversation since
 * Alice's joinedAt. Tombstones become "[deleted]" and their stored body is
 * never returned. This slice does not call a provider.
 */

import { and, desc, eq, gte } from "drizzle-orm";
import { messages } from "@db/schema";
import type { getDb } from "../queries/connection";

export const ALICE_DELETED_CONTENT = "[deleted]";

export type AliceContextMessage = {
  id: number;
  senderId: number;
  content: string;
  createdAt: string;
  tombstone: boolean;
};

export type AliceContextSource = {
  id: number;
  senderId: number;
  content: string;
  createdAt: Date | string;
  deletedAt: Date | string | null;
};

type MentionDb = ReturnType<typeof getDb>;

function toMillis(value: Date | string): number {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Last `limit` messages at or after `joinedAt`, oldest first.
 * A tombstone never contributes its stored content.
 */
export function assembleAliceContext(
  rows: AliceContextSource[],
  input: { joinedAt: Date | string; limit: number },
): AliceContextMessage[] {
  const floor = toMillis(input.joinedAt);
  const limit = Number.isInteger(input.limit) && input.limit > 0 ? input.limit : 50;
  const eligible = rows
    .filter((row) => toMillis(row.createdAt) >= floor)
    .sort((a, b) => a.id - b.id);
  return eligible.slice(-limit).map((row) => {
    const tombstone = row.deletedAt != null;
    return {
      id: row.id,
      senderId: row.senderId,
      content: tombstone ? ALICE_DELETED_CONTENT : row.content,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
      tombstone,
    };
  });
}

export async function loadAliceContext(
  db: MentionDb,
  input: { conversationId: number; joinedAt: Date; limit: number },
): Promise<AliceContextMessage[]> {
  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      content: messages.content,
      createdAt: messages.createdAt,
      deletedAt: messages.deletedAt,
    })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, input.conversationId),
        gte(messages.createdAt, input.joinedAt),
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(input.limit);
  return assembleAliceContext(rows, { joinedAt: input.joinedAt, limit: input.limit });
}
