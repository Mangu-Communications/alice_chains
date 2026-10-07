/**
 * A1-004. Admin Admit / Decline on the admission card (MASTER §7.4).
 *
 * Admit adds the Alice user to conversationParticipants and replaces the card.
 * Decline replaces the card and is remembered so a later @alice does not open
 * another card. After Admit, Alice replies to the original @alice message.
 */

import { and, desc, eq, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { aliceDeclines, conversationParticipants, conversations, messages } from "@db/schema";
import { getDb } from "../queries/connection";
import { loadAliceContext, type AliceContextMessage } from "./alice-context";
import { ALICE_ADMISSION_MARKER, mentionsAlice, readAliceContextMessages } from "./alice-mention";
import { deliverAliceReply } from "./alice-reply";
import { log } from "./logger";
import { emitToConversation, emitToMembers } from "./realtime";
import { readAliceUserId } from "./alice-user";

export const ALICE_ADMITTED_PREFIX = "Alice has been admitted by ";
export const ALICE_DECLINED_PREFIX = "Alice was declined by ";
export const ALICE_DECLINED_SUFFIX = ". This conversation remains AI-free.";

export type AliceDecision = "admit" | "decline";

/** Display name for the decision sentence. Never a raw control character. */
export function adminDecisionName(name: string | null | undefined): string {
  const cleaned = (name ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "an admin";
  return cleaned.slice(0, 80);
}

export function admissionDecisionCopy(decision: AliceDecision, adminName: string | null | undefined): string {
  const who = adminDecisionName(adminName);
  if (decision === "admit") return `${ALICE_ADMITTED_PREFIX}${who}.`;
  return `${ALICE_DECLINED_PREFIX}${who}${ALICE_DECLINED_SUFFIX}`;
}

export function isOpenAdmissionCard(content: string): boolean {
  return content.startsWith(ALICE_ADMISSION_MARKER);
}

type AdmissionDb = ReturnType<typeof getDb>;

export async function decideAliceAdmission(
  input: {
    conversationId: number;
    messageId: number;
    decision: AliceDecision;
    actorId: number;
    actorRole: "user" | "admin";
    actorName: string | null;
  },
  db: AdmissionDb = getDb(),
): Promise<{ content: string; aliceUserId: number }> {
  const aliceUserId = readAliceUserId();
  if (aliceUserId == null) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Alice is not configured" });
  }

  const [conversation] = await db
    .select({ id: conversations.id, type: conversations.type, createdBy: conversations.createdBy })
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .limit(1);
  if (!conversation || conversation.type !== "group") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This is not a group conversation" });
  }

  const isOwner = conversation.createdBy === input.actorId;
  const isInstanceAdmin = input.actorRole === "admin";
  if (!isOwner && !isInstanceAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only a group admin can admit or decline Alice",
    });
  }

  const [card] = await db
    .select({
      id: messages.id,
      content: messages.content,
      type: messages.type,
      senderId: messages.senderId,
      deletedAt: messages.deletedAt,
    })
    .from(messages)
    .where(and(eq(messages.id, input.messageId), eq(messages.conversationId, input.conversationId)))
    .limit(1);
  if (
    !card ||
    card.deletedAt ||
    card.type !== "system" ||
    card.senderId !== aliceUserId ||
    !isOpenAdmissionCard(card.content)
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "That is not an open Alice admission card" });
  }

  const [decline] = await db
    .select({ conversationId: aliceDeclines.conversationId })
    .from(aliceDeclines)
    .where(eq(aliceDeclines.conversationId, input.conversationId))
    .limit(1);
  if (decline && input.decision === "admit") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Alice was declined in this conversation",
    });
  }

  const content = admissionDecisionCopy(input.decision, input.actorName);
  if (input.decision === "admit") {
    const [membership] = await db
      .select({ id: conversationParticipants.id })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, input.conversationId),
          eq(conversationParticipants.userId, aliceUserId),
        ),
      )
      .limit(1);
    if (!membership) {
      await db.insert(conversationParticipants).values({
        conversationId: input.conversationId,
        userId: aliceUserId,
        lastReadAt: new Date(),
      });
    }
  } else if (!decline) {
    await db.insert(aliceDeclines).values({
      conversationId: input.conversationId,
      declinedBy: input.actorId,
    });
  }

  await db.update(messages).set({ content, isEdited: true }).where(eq(messages.id, card.id));
  return { content, aliceUserId };
}

export type AdmissionTriggerCandidate = {
  id: number;
  senderId: number;
  content: string;
  type: string;
  deletedAt: Date | string | null;
};

/**
 * The message that opened the card: latest non-deleted text @alice before the card.
 * Alice's own rows and later messages are not the original mention.
 */
export function selectOriginalAliceMention(
  rows: AdmissionTriggerCandidate[],
  cardId: number,
  aliceUserId: number,
): AdmissionTriggerCandidate | null {
  const eligible = rows
    .filter(
      (row) =>
        row.id < cardId &&
        row.deletedAt == null &&
        row.type === "text" &&
        row.senderId !== aliceUserId &&
        mentionsAlice(row.content),
    )
    .sort((a, b) => b.id - a.id);
  return eligible[0] ?? null;
}

/**
 * §7.4 step 2. After Admit, generate a reply to the original mention.
 * Missing ALICE_API_KEY stays the existing error note inside deliverAliceReply.
 */
export async function replyAfterAliceAdmit(
  input: { conversationId: number; cardId: number; aliceUserId: number },
  db: AdmissionDb = getDb(),
): Promise<"replied" | "error" | "no_trigger"> {
  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      content: messages.content,
      type: messages.type,
      deletedAt: messages.deletedAt,
    })
    .from(messages)
    .where(and(eq(messages.conversationId, input.conversationId), lt(messages.id, input.cardId)))
    .orderBy(desc(messages.id))
    .limit(50);
  const trigger = selectOriginalAliceMention(rows, input.cardId, input.aliceUserId);
  if (!trigger) {
    log.warn("alice admit has no original mention", {
      event: "alice.admit.no_trigger",
      conversationId: input.conversationId,
    });
    return "no_trigger";
  }
  const [membership] = await db
    .select({ joinedAt: conversationParticipants.joinedAt })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, input.conversationId),
        eq(conversationParticipants.userId, input.aliceUserId),
      ),
    )
    .limit(1);
  const rawJoined = membership?.joinedAt;
  const joinedAt = rawJoined instanceof Date ? rawJoined : new Date(rawJoined ?? Date.now());
  const context = await loadAliceContext(db, {
    conversationId: input.conversationId,
    joinedAt,
    limit: readAliceContextMessages(),
  });
  const withTrigger: AliceContextMessage[] = context.some((row) => row.id === trigger.id)
    ? context
    : [
        ...context,
        {
          id: trigger.id,
          senderId: trigger.senderId,
          content: trigger.content,
          createdAt: new Date().toISOString(),
          tombstone: false,
        },
      ];
  return deliverAliceReply({
    conversationId: input.conversationId,
    aliceUserId: input.aliceUserId,
    triggerContent: trigger.content,
    context: withTrigger,
  });
}

export async function applyAliceAdmission(input: {
  conversationId: number;
  messageId: number;
  decision: AliceDecision;
  actorId: number;
  actorRole: "user" | "admin";
  actorName: string | null;
}): Promise<{ content: string }> {
  const db = getDb();
  const decided = await decideAliceAdmission(input, db);
  const payload = {
    id: input.messageId,
    conversationId: input.conversationId,
    content: decided.content,
    isEdited: true,
  };
  emitToConversation(input.conversationId, "messageUpdated", payload);
  await emitToMembers(input.conversationId, "conversationUpdated", {
    conversationId: input.conversationId,
  });
  if (input.decision === "admit") {
    try {
      await replyAfterAliceAdmit(
        {
          conversationId: input.conversationId,
          cardId: input.messageId,
          aliceUserId: decided.aliceUserId,
        },
        db,
      );
    } catch (error) {
      log.warn("alice admit reply failed", {
        event: "alice.admit.reply_failed",
        conversationId: input.conversationId,
        error: error instanceof Error ? error.name : "error",
      });
    }
  }
  return { content: decided.content };
}

/** Used by mention detection. A decline row, not the card text, is the memory. */
export async function conversationDeclinedAlice(
  conversationId: number,
  db: AdmissionDb = getDb(),
): Promise<boolean> {
  const [row] = await db
    .select({ conversationId: aliceDeclines.conversationId })
    .from(aliceDeclines)
    .where(eq(aliceDeclines.conversationId, conversationId))
    .limit(1);
  return row != null;
}
