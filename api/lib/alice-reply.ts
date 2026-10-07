/**
 * A1-007 / A1-009. Store Alice's reply as a normal text message and broadcast it.
 * Missing key and provider failures become the §7.6 system note.
 * A reached daily cap stores the §7.7 limit note and does not call Anthropic.
 * The human send already succeeded; the guest path stores the note instead of HTTP 402.
 */

import { and, eq, inArray } from "drizzle-orm";
import { MAX_MESSAGE_LENGTH } from "@contracts/constants";
import { conversations, messages, users } from "@db/schema";
import { getDb } from "../queries/connection";
import { insertMessage } from "../queries/messages";
import type { AliceContextMessage } from "./alice-context";
import { log } from "./logger";
import {
  ALICE_LIMIT_NOTE,
  aliceCompletionCostUSD,
  aliceCostReachesCap,
  readAliceConvDailyCapUsd,
  readAliceDailyCapUsd,
  readAliceDailyCost,
  recordAliceDailyCost,
  utcCostDate,
} from "./alice-cost";
import {
  ALICE_ERROR_NOTE,
  aliceFirstResponseFooter,
  buildAliceSystemPrompt,
  buildAliceUserTurn,
  readAliceApiKey,
  readAliceMaxTokens,
  readAliceModel,
  requestAliceCompletion,
  withAliceFooter,
} from "./alice-provider";

async function emitStored(conversationId: number, stored: unknown) {
  if (!stored) return;
  const { getIO } = await import("../socket");
  getIO()?.to(`conv_${conversationId}`).emit("newMessage", stored);
}

async function storeAliceNote(conversationId: number, aliceUserId: number, content: string, type: "text" | "system") {
  const stored = await insertMessage({
    conversationId,
    senderId: aliceUserId,
    content,
    type,
  });
  await emitStored(conversationId, stored);
  return stored;
}

/**
 * Reply to an admitted @alice mention. Failures stay off the human send path.
 */
export async function deliverAliceReply(input: {
  conversationId: number;
  aliceUserId: number;
  triggerContent: string;
  context: AliceContextMessage[];
}): Promise<"replied" | "error" | "capped"> {
  try {
    const db = getDb();
    const date = utcCostDate();
    const [conversationCost, instanceCost] = await Promise.all([
      readAliceDailyCost(db, { scope: "conversation", scopeId: input.conversationId, date }),
      readAliceDailyCost(db, { scope: "instance", date }),
    ]);
    const conversationCapped = aliceCostReachesCap(conversationCost?.costUSD, readAliceConvDailyCapUsd());
    const instanceCapped = aliceCostReachesCap(instanceCost?.costUSD, readAliceDailyCapUsd());
    if (conversationCapped || instanceCapped) {
      log.warn("alice cost cap reached", {
        event: "alice.cost.cap",
        conversationId: input.conversationId,
        scope: instanceCapped ? "instance" : "conversation",
      });
      await storeAliceNote(input.conversationId, input.aliceUserId, ALICE_LIMIT_NOTE, "system");
      return "capped";
    }
    const senderIds = [...new Set(input.context.map((row) => row.senderId))];
    const nameRows = senderIds.length
      ? await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, senderIds))
      : [];
    const names = new Map(nameRows.map((row) => [row.id, row.name?.trim() || "user"]));
    const [conversation] = await db
      .select({ name: conversations.name })
      .from(conversations)
      .where(eq(conversations.id, input.conversationId))
      .limit(1);
    const [priorText] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, input.conversationId),
          eq(messages.senderId, input.aliceUserId),
          eq(messages.type, "text"),
        ),
      )
      .limit(1);
    const history = input.context.map((row) => ({
      username: names.get(row.senderId) || "user",
      content: row.content,
    }));
    const triggerLine = [...input.context].reverse().find((row) => row.content === input.triggerContent);
    const triggerUsername = triggerLine ? names.get(triggerLine.senderId) || "user" : "user";
    const system = buildAliceSystemPrompt({
      conversationName: conversation?.name?.trim() || "this chat",
      triggerUsername,
    });
    const userContent = buildAliceUserTurn({
      history,
      trigger: { username: triggerUsername, content: input.triggerContent },
    });
    const apiKey = readAliceApiKey();
    if (!apiKey) {
      log.warn("alice provider key missing", {
        event: "alice.provider.missing_key",
        conversationId: input.conversationId,
      });
      await storeAliceNote(input.conversationId, input.aliceUserId, ALICE_ERROR_NOTE, "system");
      return "error";
    }
    const completion = await requestAliceCompletion(
      {
        apiKey,
        model: readAliceModel(),
        maxTokens: readAliceMaxTokens(),
        system,
        userContent,
      },
      (url, init) => fetch(url, init),
    );
    const costUSD = aliceCompletionCostUSD(completion.inputTokens, completion.outputTokens);
    try {
      await recordAliceDailyCost(db, {
        scope: "conversation",
        scopeId: input.conversationId,
        date,
        inputTokens: completion.inputTokens ?? 0,
        outputTokens: completion.outputTokens ?? 0,
        costUSD,
      });
      await recordAliceDailyCost(db, {
        scope: "instance",
        date,
        inputTokens: completion.inputTokens ?? 0,
        outputTokens: completion.outputTokens ?? 0,
        costUSD,
      });
    } catch (costError) {
      log.warn("alice cost record failed", {
        event: "alice.cost.record_failed",
        conversationId: input.conversationId,
        error: costError instanceof Error ? costError.name : "error",
      });
    }
    const footer = priorText
      ? null
      : aliceFirstResponseFooter(completion.model, input.context.length);
    const content = withAliceFooter(completion.text, footer, MAX_MESSAGE_LENGTH);
    await storeAliceNote(input.conversationId, input.aliceUserId, content, "text");
    return "replied";
  } catch (error) {
    log.warn("alice provider failed", {
      event: "alice.provider.error",
      conversationId: input.conversationId,
      error: error instanceof Error ? error.name : "error",
    });
    try {
      await storeAliceNote(input.conversationId, input.aliceUserId, ALICE_ERROR_NOTE, "system");
    } catch (storeError) {
      log.warn("alice error note failed", {
        event: "alice.provider.note_failed",
        conversationId: input.conversationId,
        error: storeError instanceof Error ? storeError.name : "error",
      });
    }
    return "error";
  }
}

