/**
 * A1-014. Thumbs up/down on Alice messages only.
 *
 * The numeric Alice id stays operator-set (ALICE_USER_ID). This module
 * never invents one. A second tap of the same thumb clears the rating.
 */

export const ALICE_RATINGS = ["up", "down"] as const;
export type AliceRating = (typeof ALICE_RATINGS)[number];

export function parseAliceRating(value: unknown): AliceRating | null {
  return value === "up" || value === "down" ? value : null;
}

/** Same thumb again clears. A different thumb replaces. */
export function nextAliceRating(
  current: AliceRating | null,
  choice: AliceRating,
): AliceRating | null {
  return current === choice ? null : choice;
}
