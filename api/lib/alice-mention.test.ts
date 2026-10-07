import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  ALICE_ADMISSION_MARKER,
  ALICE_DECLINED_NOTE,
  applyAliceMention,
  buildAdmissionCard,
  decideAliceTrigger,
  mentionsAlice,
  readAliceContextMessages,
  readAliceEnabled,
  readAliceProviderLabel,
} from "./alice-mention";

const group = {
  conversationType: "group" as const,
  enabled: true,
  aliceUserId: 7,
  aliceIsParticipant: false,
  declined: false,
};

describe("A1-003 @alice trigger", () => {
  it("matches an @alice token and ignores handles and direct chats", () => {
    expect(mentionsAlice("hey @alice what is this")).toBe(true);
    expect(mentionsAlice("@Alice,")).toBe(true);
    expect(mentionsAlice("mail@alice.com")).toBe(false);
    expect(mentionsAlice("@alice2")).toBe(false);
    expect(mentionsAlice("no mention")).toBe(false);
    expect(decideAliceTrigger({ ...group, content: "hi" })).toBe("ignore");
    expect(decideAliceTrigger({ ...group, content: "@alice", conversationType: "direct" })).toBe("ignore");
  });

  it("ignores the mention when disabled or when ALICE_USER_ID is unset", () => {
    expect(readAliceEnabled({})).toBe(true);
    expect(readAliceEnabled({ ALICE_ENABLED: "false" })).toBe(false);
    expect(readAliceEnabled({ ALICE_ENABLED: "off" })).toBe(false);
    expect(decideAliceTrigger({ ...group, content: "@alice", enabled: false })).toBe("ignore");
    expect(decideAliceTrigger({ ...group, content: "@alice", aliceUserId: null })).toBe("ignore");
  });

  it("starts admission only when Alice has never been in the group", () => {
    expect(decideAliceTrigger({ ...group, content: "@alice" })).toBe("start_admission");
    expect(decideAliceTrigger({ ...group, content: "@alice", aliceIsParticipant: true })).toBe("reply_deferred");
    expect(decideAliceTrigger({ ...group, content: "@alice", declined: true })).toBe("declined_note");
    expect(ALICE_DECLINED_NOTE).toContain("Admins can re-invite");
  });

  it("writes the §7.4 card and does not call a model", async () => {
    expect(readAliceProviderLabel({})).toBe("Anthropic");
    expect(readAliceContextMessages({})).toBe(50);
    expect(readAliceContextMessages({ ALICE_CONTEXT_MESSAGES: "12" })).toBe(12);
    const card = buildAdmissionCard({ contextMessages: 50, providerLabel: "Anthropic" });
    expect(card.startsWith(ALICE_ADMISSION_MARKER)).toBe(true);
    expect(card).toContain("last 50 messages");
    expect(card).toContain("Anthropic");
    expect(card).toContain("Admit Alice");
    expect(card).toContain("Decline");

    const insertAdmission = vi.fn(async (_content: string) => ({ id: 1 }));
    const started = await applyAliceMention(
      {
        conversationId: 3,
        content: "please @alice",
        ...group,
        hasOpenAdmission: false,
        contextMessages: 50,
        providerLabel: "Anthropic",
      },
      { insertAdmission },
    );
    expect(started).toBe("start_admission");
    expect(insertAdmission).toHaveBeenCalledOnce();
    expect(String(insertAdmission.mock.calls[0][0])).toContain(ALICE_ADMISSION_MARKER);

    insertAdmission.mockClear();
    const deferred = await applyAliceMention(
      {
        conversationId: 3,
        content: "@alice again",
        ...group,
        aliceIsParticipant: true,
        hasOpenAdmission: false,
        contextMessages: 50,
        providerLabel: "Anthropic",
      },
      { insertAdmission },
    );
    expect(deferred).toBe("reply_deferred");
    expect(insertAdmission).not.toHaveBeenCalled();
  });

  it("adds the system message type in migration 0014", () => {
    const sql = readFileSync("db/migrations/0014_alice_admission_message.sql", "utf8");
    expect(sql).toContain("enum('text','image','file','system')");
    const journal = readFileSync("db/migrations/meta/_journal.json", "utf8");
    expect(journal).toContain('"tag": "0014_alice_admission_message"');
    expect(journal).toContain('"idx": 14');
  });
});
