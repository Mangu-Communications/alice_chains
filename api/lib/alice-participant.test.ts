import { describe, expect, it } from "vitest";
import {
  ALICE_REMOVED_PREFIX,
  ALICE_REMOVED_SUFFIX,
  planAliceReinvite,
  planAliceRemoval,
  removalCopy,
} from "./alice-participant";

describe("alice participant management", () => {
  it("writes the removal sentence and keeps the AI-free ending", () => {
    expect(removalCopy("Morgan")).toBe(
      "Alice was removed by Morgan. This conversation remains AI-free.",
    );
    expect(removalCopy("  Morgan\nLead  ")).toBe(
      `${ALICE_REMOVED_PREFIX}Morgan Lead${ALICE_REMOVED_SUFFIX}`,
    );
    expect(removalCopy("")).toBe(
      `${ALICE_REMOVED_PREFIX}an admin${ALICE_REMOVED_SUFFIX}`,
    );
  });

  it("remembers a removal only while Alice is still a participant", () => {
    expect(planAliceRemoval({ isParticipant: true, hasOpenAdmission: false })).toEqual({
      remember: true,
    });
    expect(() => planAliceRemoval({ isParticipant: false, hasOpenAdmission: false })).toThrow(
      /not in this conversation/,
    );
  });

  it("re-invite clears the decline and opens a card only when none is open", () => {
    expect(planAliceReinvite({ isParticipant: false, hasOpenAdmission: false })).toEqual({
      clearDecline: true,
      openAdmission: true,
    });
    expect(planAliceReinvite({ isParticipant: false, hasOpenAdmission: true })).toEqual({
      clearDecline: true,
      openAdmission: false,
    });
    expect(() => planAliceReinvite({ isParticipant: true, hasOpenAdmission: false })).toThrow(
      /before re-inviting/,
    );
  });
});
