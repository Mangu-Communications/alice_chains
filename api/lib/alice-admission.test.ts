import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALICE_ADMITTED_PREFIX,
  ALICE_DECLINED_PREFIX,
  ALICE_DECLINED_SUFFIX,
  adminDecisionName,
  admissionDecisionCopy,
  isOpenAdmissionCard,
  selectOriginalAliceMention,
} from "./alice-admission";
import { ALICE_ADMISSION_MARKER } from "./alice-mention";

describe("alice admission actions", () => {
  it("writes the §7.4 decision sentences", () => {
    expect(admissionDecisionCopy("admit", "Morgan")).toBe("Alice has been admitted by Morgan.");
    expect(admissionDecisionCopy("decline", "Morgan")).toBe(
      "Alice was declined by Morgan. This conversation remains AI-free.",
    );
    expect(admissionDecisionCopy("admit", "  Morgan\nLead  ")).toBe(
      `${ALICE_ADMITTED_PREFIX}Morgan Lead.`,
    );
    expect(adminDecisionName("")).toBe("an admin");
    expect(admissionDecisionCopy("decline", "")).toContain(ALICE_DECLINED_PREFIX);
    expect(admissionDecisionCopy("decline", "")).toContain(ALICE_DECLINED_SUFFIX);
  });

  it("treats only the admission marker as an open card", () => {
    expect(isOpenAdmissionCard(`${ALICE_ADMISSION_MARKER} Before she can reply`)).toBe(true);
    expect(isOpenAdmissionCard("Alice has been admitted by Morgan.")).toBe(false);
    expect(isOpenAdmissionCard("Alice was declined by Morgan. This conversation remains AI-free.")).toBe(
      false,
    );
  });

  it("replies to the original @alice after Admit, not a later mention", () => {
    const rows = [
      { id: 1, senderId: 4, content: "earlier @alice please", type: "text", deletedAt: null },
      { id: 2, senderId: 4, content: "@alice what is the plan", type: "text", deletedAt: null },
      { id: 3, senderId: 7, content: "Alice is an AI.", type: "system", deletedAt: null },
      { id: 4, senderId: 9, content: "@alice ignore this later one", type: "text", deletedAt: null },
      { id: 5, senderId: 7, content: "@alice from Alice", type: "text", deletedAt: null },
      { id: 6, senderId: 4, content: "@alice deleted", type: "text", deletedAt: "2026-10-07T00:00:00.000Z" },
    ];
    expect(selectOriginalAliceMention(rows, 3, 7)?.id).toBe(2);
    expect(selectOriginalAliceMention(rows, 3, 7)?.content).toBe("@alice what is the plan");
    expect(selectOriginalAliceMention(rows, 1, 7)).toBeNull();
    const src = readFileSync("api/lib/alice-admission.ts", "utf8");
    expect(src).toContain("replyAfterAliceAdmit");
    expect(src).toContain('input.decision === "admit"');
    expect(src).toContain("deliverAliceReply");
    const declineBranch = src.slice(src.indexOf("if (input.decision === \"admit\")"));
    expect(declineBranch.startsWith('if (input.decision === "admit")')).toBe(true);
  });

  it("remembers a decline in migration 0015", () => {
    const sql = readFileSync("db/migrations/0015_alice_declines.sql", "utf8");
    expect(sql).toContain("CREATE TABLE `alice_declines`");
    expect(sql).toContain("PRIMARY KEY(`conversationId`)");
    const journal = readFileSync("db/migrations/meta/_journal.json", "utf8");
    expect(journal).toContain('"tag": "0015_alice_declines"');
    expect(journal).toContain('"idx": 15');
  });
});
