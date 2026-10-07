import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { aliceErrorDetail, aliceInvokeDetail, recordAliceError, recordAliceInvoke } from "./alice-audit";

vi.mock("./audit", () => ({
  recordAudit: vi.fn(async () => undefined),
}));

import { recordAudit } from "./audit";

describe("A1-010 alice audit", () => {
  it("records invoke facts without message text", async () => {
    const detail = aliceInvokeDetail({
      triggerMessageId: 44,
      contextMessages: 3,
      inputTokens: 12,
      outputTokens: 4,
      costUSD: 0.000008,
      modelVersion: "claude-haiku-4-5-20251001",
      durationMs: 90,
    });
    expect(detail).not.toContain("@alice");
    expect(JSON.parse(detail)).toEqual({
      triggerMessageId: 44,
      contextMessages: 3,
      inputTokens: 12,
      outputTokens: 4,
      costUSD: 0.000008,
      modelVersion: "claude-haiku-4-5-20251001",
      durationMs: 90,
    });
    expect(detail.length).toBeLessThanOrEqual(512);

    await recordAliceInvoke({
      actorId: 7,
      conversationId: 9,
      triggerMessageId: 44,
      contextMessages: 3,
      inputTokens: 12,
      outputTokens: 4,
      costUSD: 0.000008,
      modelVersion: "claude-haiku-4-5-20251001",
      durationMs: 90,
    });
    expect(recordAudit).toHaveBeenCalledWith({
      actorId: 7,
      action: "alice_invoke",
      targetType: "conversation",
      targetId: "9",
      outcome: "success",
      detail,
    });
  });

  it("records a cost-cap refusal as alice_error", async () => {
    const detail = aliceErrorDetail({ reason: "cost_cap", durationMs: 2 });
    await recordAliceError({
      actorId: 7,
      conversationId: 9,
      reason: "cost_cap",
      durationMs: 2,
    });
    expect(recordAudit).toHaveBeenCalledWith({
      actorId: 7,
      action: "alice_error",
      targetType: "conversation",
      targetId: "9",
      outcome: "failure",
      detail,
    });
  });

  it("writes invoke after a reply and error on the refusal paths", () => {
    const src = readFileSync("api/lib/alice-reply.ts", "utf8");
    const body = src.slice(src.indexOf("export async function deliverAliceReply"));
    const cap = body.indexOf("conversationCapped || instanceCapped");
    const missing = body.indexOf("if (!apiKey)");
    const call = body.indexOf("requestAliceCompletion");
    const replyStore = body.indexOf("withAliceFooter");
    expect(body.indexOf("recordAliceError")).toBeGreaterThan(-1);
    expect(body.indexOf('reason: "cost_cap"')).toBeGreaterThan(cap);
    expect(body.indexOf('reason: "cost_cap"')).toBeLessThan(call);
    expect(body.indexOf('reason: "missing_key"')).toBeGreaterThan(missing);
    expect(body.indexOf('reason: "missing_key"')).toBeLessThan(call);
    expect(body.indexOf("recordAliceInvoke")).toBeGreaterThan(call);
    expect(body.indexOf("recordAliceInvoke")).toBeGreaterThan(replyStore);
    expect(body).toContain('reason: "provider_error"');
    expect(src).toContain("ALICE_ERROR_NOTE");
    expect(src).toContain("ALICE_LIMIT_NOTE");
  });
});
