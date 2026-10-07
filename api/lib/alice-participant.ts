/**
 * A1-005. Remove Alice and re-invite after a decline (MASTER §7.3, US-55).
 *
 * Remove drops her conversationParticipants row and remembers the removal in
 * alice_declines, the same memory a decline uses, so a later @alice does not
 * open another card. Re-invite clears that row and may open a new admission
 * card. This slice does not generate Alice's reply.
 */

import { and, eq, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { aliceDeclines, conversationParticipants, conversations, messages } from "@db/schema";
import { getDb } from "../queries/connection";
import { insertMessage } from "../queries/messages";
import { readAliceUserId } from "./alice-user";
import { planAliceKillSwitch, readAliceEnabled } from "./alice-enabled";
import { ALICE_ADMISSION_MARKER, buildAdmissionCard, readAliceContextMessages, readAliceProviderLabel } from "./alice-mention";
import { adminDecisionName } from "./alice-admission";
import { emitToMembers } from "./realtime";

export const ALICE_REMOVED_PREFIX = "Alice was removed by ";
export const ALICE_REMOVED_SUFFIX = ". This conversation remains AI-free.";

export function removalCopy(adminName: string | null | undefined): string {
  return `${ALICE_REMOVED_PREFIX}${adminDecisionName(adminName)}${ALICE_REMOVED_SUFFIX}`;
}

export type AliceRoomMemory = {
  isParticipant: boolean;
  hasOpenAdmission: boolean;
};

/** Remove is only valid while Alice still has a member row. */
export function planAliceRemoval(state: AliceRoomMemory): { remember: true } {
  if (!state.isParticipant) {
    throw new Error("Alice is not in this conversation");
  }
  return { remember: true };
}

/**
 * Re-invite never adds the participant row. Admit still does that.
 * A card opens only when one is not already open.
 */
export function planAliceReinvite(state: AliceRoomMemory): { clearDecline: true; openAdmission: boolean } {
  if (state.isParticipant) {
    throw new Error("Remove Alice before re-inviting");
  }
  return { clearDecline: true, openAdmission: !state.hasOpenAdmission };
}

type ParticipantDb = ReturnType<typeof getDb>;

function assertCanManageAlice(input: {
  actorId: number;
  actorRole: "user" | "admin";
  createdBy: number;
}): void {
  if (input.createdBy === input.actorId || input.actorRole === "admin") return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Only a group admin can remove or re-invite Alice",
  });
}

async function loadGroup(
  db: ParticipantDb,
  conversationId: number,
  actorId: number,
  actorRole: "user" | "admin",
) {
  const aliceUserId = readAliceUserId();
  if (aliceUserId == null) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Alice is not configured" });
  }
  const [conversation] = await db
    .select({ id: conversations.id, type: conversations.type, createdBy: conversations.createdBy })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conversation || conversation.type !== "group") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This is not a group conversation" });
  }
  assertCanManageAlice({ actorId, actorRole, createdBy: conversation.createdBy });
  return { aliceUserId, conversation };
}

async function aliceMembership(db: ParticipantDb, conversationId: number, aliceUserId: number) {
  const [membership] = await db
    .select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, aliceUserId),
      ),
    )
    .limit(1);
  return membership ?? null;
}

async function openAdmissionId(db: ParticipantDb, conversationId: number, aliceUserId: number) {
  const [openCard] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.senderId, aliceUserId),
        eq(messages.type, "system"),
        like(messages.content, `${ALICE_ADMISSION_MARKER}%`),
      ),
    )
    .limit(1);
  return openCard?.id ?? null;
}

async function emitSystemMessage(conversationId: number, senderId: number, content: string) {
  const stored = await insertMessage({
    conversationId,
    senderId,
    content,
    type: "system",
  });
  if (stored) {
    const { getIO } = await import("../socket");
    getIO()?.to(`conv_${conversationId}`).emit("newMessage", stored);
  }
  return stored;
}

/** Shared by the dedicated remove and by a generic member remove of Alice. */
export async function rememberAliceRemoval(input: {
  conversationId: number;
  actorId: number;
  actorName: string | null;
  aliceUserId: number;
}): Promise<{ content: string }> {
  const db = getDb();
  const [decline] = await db
    .select({ conversationId: aliceDeclines.conversationId })
    .from(aliceDeclines)
    .where(eq(aliceDeclines.conversationId, input.conversationId))
    .limit(1);
  if (!decline) {
    await db.insert(aliceDeclines).values({
      conversationId: input.conversationId,
      declinedBy: input.actorId,
    });
  }
  const content = removalCopy(input.actorName);
  await emitSystemMessage(input.conversationId, input.aliceUserId, content);
  await emitToMembers(input.conversationId, "conversationUpdated", {
    conversationId: input.conversationId,
  });
  return { content };
}

export async function removeAlice(input: {
  conversationId: number;
  actorId: number;
  actorRole: "user" | "admin";
  actorName: string | null;
}): Promise<{ content: string }> {
  const db = getDb();
  const { aliceUserId } = await loadGroup(db, input.conversationId, input.actorId, input.actorRole);
  const membership = await aliceMembership(db, input.conversationId, aliceUserId);
  try {
    planAliceRemoval({ isParticipant: membership != null, hasOpenAdmission: false });
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Alice is not in this conversation",
    });
  }
  await db
    .delete(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, input.conversationId),
        eq(conversationParticipants.userId, aliceUserId),
      ),
    );
  return rememberAliceRemoval({
    conversationId: input.conversationId,
    actorId: input.actorId,
    actorName: input.actorName,
    aliceUserId,
  });
}

export async function reinviteAlice(input: {
  conversationId: number;
  actorId: number;
  actorRole: "user" | "admin";
  actorName: string | null;
}): Promise<{ opened: boolean }> {
  if (planAliceKillSwitch(readAliceEnabled()) === "skip") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Alice is disabled on this instance (ALICE_ENABLED). Existing memberships stay.",
    });
  }
  const db = getDb();
  const { aliceUserId } = await loadGroup(db, input.conversationId, input.actorId, input.actorRole);
  const membership = await aliceMembership(db, input.conversationId, aliceUserId);
  const openId = await openAdmissionId(db, input.conversationId, aliceUserId);
  let plan: ReturnType<typeof planAliceReinvite>;
  try {
    plan = planAliceReinvite({
      isParticipant: membership != null,
      hasOpenAdmission: openId != null,
    });
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Remove Alice before re-inviting",
    });
  }
  await db.delete(aliceDeclines).where(eq(aliceDeclines.conversationId, input.conversationId));
  if (plan.openAdmission) {
    await emitSystemMessage(
      input.conversationId,
      aliceUserId,
      buildAdmissionCard({
        contextMessages: readAliceContextMessages(),
        providerLabel: readAliceProviderLabel(),
      }),
    );
  }
  await emitToMembers(input.conversationId, "conversationUpdated", {
    conversationId: input.conversationId,
  });
  return { opened: plan.openAdmission };
}
