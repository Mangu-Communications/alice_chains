/**
 * A1-010. §7.6 step 5. Counts and ids only — never message text or a stack.
 */
import { recordAudit } from "./audit";

export type AliceAuditReason = "missing_key" | "provider_error" | "cost_cap" | "disabled";

export type AliceInvokeFacts = {
  triggerMessageId: number | null;
  contextMessages: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  modelVersion: string;
  durationMs: number;
};

/** Stable JSON the admin log can read. Omits conversation body on purpose. */
export function aliceInvokeDetail(facts: AliceInvokeFacts): string {
  return JSON.stringify({
    triggerMessageId: facts.triggerMessageId,
    contextMessages: facts.contextMessages,
    inputTokens: facts.inputTokens,
    outputTokens: facts.outputTokens,
    costUSD: facts.costUSD,
    modelVersion: facts.modelVersion,
    durationMs: facts.durationMs,
  });
}

export function aliceErrorDetail(input: { reason: AliceAuditReason; durationMs: number }): string {
  return JSON.stringify({ reason: input.reason, durationMs: input.durationMs });
}

export async function recordAliceInvoke(input: AliceInvokeFacts & {
  actorId: number;
  conversationId: number;
}): Promise<void> {
  await recordAudit({
    actorId: input.actorId,
    action: "alice_invoke",
    targetType: "conversation",
    targetId: String(input.conversationId),
    outcome: "success",
    detail: aliceInvokeDetail(input),
  });
}

export async function recordAliceError(input: {
  actorId: number;
  conversationId: number;
  reason: AliceAuditReason;
  durationMs: number;
}): Promise<void> {
  await recordAudit({
    actorId: input.actorId,
    action: "alice_error",
    targetType: "conversation",
    targetId: String(input.conversationId),
    outcome: "failure",
    detail: aliceErrorDetail(input),
  });
}
