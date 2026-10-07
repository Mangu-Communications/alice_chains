/**
 * A1-011. Pins the member-list and message-label decision: sparkle and
 * an AI badge only for the server-supplied Alice id.
 */
import { describe, expect, it } from "vitest";
import { ALICE_AI_BADGE, isAliceParticipant } from "./alice-display";

describe("isAliceParticipant", () => {
  it("matches only the operator-supplied Alice id", () => {
    expect(isAliceParticipant(9, 9)).toBe(true);
    expect(ALICE_AI_BADGE).toBe("AI");
  });

  it("does not invent an Alice id when the server has not named one", () => {
    expect(isAliceParticipant(9, null)).toBe(false);
    expect(isAliceParticipant(9, undefined)).toBe(false);
    expect(isAliceParticipant(null, 9)).toBe(false);
    expect(isAliceParticipant(4, 9)).toBe(false);
  });
});
