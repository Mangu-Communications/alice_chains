/**
 * A1-003. @alice mention detection and admission start (MASTER §7.3–§7.4).
 *
 * This slice does not call a model or enforce cost caps.
 * An admitted participant mention assembles §7.6 context and defers the reply.
 */

import { and, eq, like } from "drizzle-orm";
import { aliceDeclines, conversationParticipants, conversations, messages } from "@db/schema";
import { getDb } from "../queries/connection";
import { insertMessage } from "../queries/messages";
import { loadAliceContext, type AliceContextMessage } from "./alice-context";
import { readAliceUserId } from "./alice-user";
import { log } from "./logger";

/** Token @alice, not a longer handle and not glued to an identifier. */
const ALICE_MENTION = /(^|[^A-Za-z0-9])@alice(?![A-Za-z0-9_])/i;

export const ALICE_DECLINED_NOTE =
  "Alice was declined in this conversation. Admins can re-invite her via conversation settings.";

export const ALICE_ADMISSION_MARKER = "Alice is an AI.";

export type AliceTriggerAction = "ignore" | "start_admission" | "reply_deferred" | "declined_note";

export type AliceMentionResult = {
  action: AliceTriggerAction;
  /** §7.6 step 1 window. Present only when a reply is deferred. No provider call. */
  context: AliceContextMessage[] | null;
};

export function mentionsAlice(content: string): boolean {
  return ALICE_MENTION.test(content);
}

/** §7.3. Only an explicit disable turns the trigger off. Empty stays enabled. */
export function readAliceEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = (env === process.env ? process.env.ALICE_ENABLED : env.ALICE_ENABLED)?.trim().toLowerCase() ?? "";
  return raw !== "false" && raw !== "0" && raw !== "off" && raw !== "no";
}

/** Label on the admission card. Not a credential. */
export function readAliceProviderLabel(env: Record<string, string | undefined> = process.env): string {
  const raw = (env === process.env ? process.env.ALICE_PROVIDER : env.ALICE_PROVIDER)?.trim() ?? "";
  if (!raw || /[\r\n]/.test(raw) || raw.length > 40) return "Anthropic";
  return raw;
}

/** §7.6 default context window, shown on the card before any model call. */
export function readAliceContextMessages(env: Record<string, string | undefined> = process.env): number {
  const raw = (env === process.env ? process.env.ALICE_CONTEXT_MESSAGES : env.ALICE_CONTEXT_MESSAGES)?.trim() ?? "";
  if (!/^[1-9][0-9]*$/.test(raw)) return 50;
  const n = Number(raw);
  return n >= 1 && n <= 200 ? n : 50;
}

export function buildAdmissionCard(input: { contextMessages: number; providerLabel: string }): string {
  const n = input.contextMessages;
  const provider = input.providerLabel;
  return (
    `${ALICE_ADMISSION_MARKER} Before she can reply, here's what happens:\n` +
    `\n` +
    `- The last ${n} messages in this conversation will be sent to ${provider} to generate her response.\n` +
    `- Alice cannot see messages sent before this moment.\n` +
    `- Alice's messages are logged on this server for auditing and cost tracking.\n` +
    `- Any group admin can remove Alice at any time.\n` +
    `\n` +
    `Alice will not respond until a group admin taps Admit Alice. Tap Decline to keep this conversation AI-free.`
  );
}

export function decideAliceTrigger(input: {
  content: string;
  conversationType: "direct" | "group";
  enabled: boolean;
  aliceUserId: number | null;
  aliceIsParticipant: boolean;
  declined: boolean;
}): AliceTriggerAction {
  if (!mentionsAlice(input.content)) return "ignore";
  if (input.conversationType !== "group") return "ignore";
  if (!input.enabled) return "ignore";
  if (input.aliceUserId == null) return "ignore";
  if (input.declined) return "declined_note";
  if (input.aliceIsParticipant) return "reply_deferred";
  return "start_admission";
}

type MentionDb = ReturnType<typeof getDb>;

export async function applyAliceMention(
  input: {
    conversationId: number;
    content: string;
    conversationType: "direct" | "group";
    enabled: boolean;
    aliceUserId: number | null;
    aliceIsParticipant: boolean;
    declined: boolean;
    hasOpenAdmission: boolean;
    contextMessages: number;
    providerLabel: string;
  },
  deps: {
    insertAdmission: (content: string) => Promise<unknown>;
  },
): Promise<AliceTriggerAction> {
  const action = decideAliceTrigger(input);
  if (action !== "start_admission" || input.hasOpenAdmission) return action;
  await deps.insertAdmission(
    buildAdmissionCard({
      contextMessages: input.contextMessages,
      providerLabel: input.providerLabel,
    }),
  );
  return action;
}

async function loadMentionContext(db: MentionDb, conversationId: number, aliceUserId: number) {
  const [conversation] = await db
    .select({ type: conversations.type })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  const [membership] = await db
    .select({ id: conversationParticipants.id, joinedAt: conversationParticipants.joinedAt })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, aliceUserId),
      ),
    )
    .limit(1);
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
  const [decline] = await db
    .select({ conversationId: aliceDeclines.conversationId })
    .from(aliceDeclines)
    .where(eq(aliceDeclines.conversationId, conversationId))
    .limit(1);
  return {
    conversationType: conversation?.type ?? "direct",
    aliceIsParticipant: membership != null,
    joinedAt: membership?.joinedAt ?? null,
    hasOpenAdmission: openCard != null,
    declined: decline != null,
  };
}

/**
 * After a human message is stored. Never generates a reply. A failure here
 * must not fail the human send.
 */
export async function handleAliceMentionAfterSend(input: {
  conversationId: number;
  content: string;
}): Promise<AliceMentionResult> {
  const enabled = readAliceEnabled();
  const aliceUserId = readAliceUserId();
  if (!mentionsAlice(input.content) || !enabled || aliceUserId == null) {
    return { action: "ignore", context: null };
  }
  try {
    const db = getDb();
    const ctx = await loadMentionContext(db, input.conversationId, aliceUserId);
    const action = await applyAliceMention(
      {
        conversationId: input.conversationId,
        content: input.content,
        conversationType: ctx.conversationType,
        enabled,
        aliceUserId,
        aliceIsParticipant: ctx.aliceIsParticipant,
        declined: ctx.declined,
        hasOpenAdmission: ctx.hasOpenAdmission,
        contextMessages: readAliceContextMessages(),
        providerLabel: readAliceProviderLabel(),
      },
      {
        insertAdmission: async (content) => {
          const stored = await insertMessage({
            conversationId: input.conversationId,
            senderId: aliceUserId,
            content,
            type: "system",
          });
          if (stored) {
            const { getIO } = await import("../socket");
            getIO()?.to(`conv_${input.conversationId}`).emit("newMessage", stored);
          }
          return stored;
        },
      },
    );
    if (action !== "reply_deferred" || ctx.joinedAt == null) return { action, context: null };
    const context = await loadAliceContext(db, {
      conversationId: input.conversationId,
      joinedAt: ctx.joinedAt,
      limit: readAliceContextMessages(),
    });
    return { action, context };
  } catch (error) {
    log.warn("alice mention failed", { event: "alice.mention", conversationId: input.conversationId, error: String(error) });
    return { action: "ignore", context: null };
  }
}
