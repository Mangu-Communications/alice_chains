import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALICE_ADMITTED_PREFIX,
  ALICE_DECLINED_PREFIX,
  ALICE_DECLINED_SUFFIX,
  adminDecisionName,
  admissionDecisionCopy,
  isOpenAdmissionCard,
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

  it("remembers a decline in migration 0015", () => {
    const sql = readFileSync("db/migrations/0015_alice_declines.sql", "utf8");
    expect(sql).toContain("CREATE TABLE `alice_declines`");
    expect(sql).toContain("PRIMARY KEY(`conversationId`)");
    const journal = readFileSync("db/migrations/meta/_journal.json", "utf8");
    expect(journal).toContain('"tag": "0015_alice_declines"');
    expect(journal).toContain('"idx": 15');
  });
});
