/**
 * A1-011. Alice is a participant, not a photo. MASTER §7.5 renders her
 * avatar as a sparkle icon. US-58 puts an "AI" label on every message
 * she sends. The id comes from the conversation payload (operator-set
 * ALICE_USER_ID). This module never invents that id.
 */

export const ALICE_AI_BADGE = "AI";

/** True only when the row is the admitted Alice user the server already named. */
export function isAliceParticipant(
  userId: number | null | undefined,
  aliceUserId: number | null | undefined,
): boolean {
  return aliceUserId != null && userId != null && userId === aliceUserId;
}
