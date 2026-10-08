/**
 * P4-005. Session pruning (MASTER US-198 / G4).
 *
 * Expired rows cannot authenticate: absolute 7-day lifetime, 24-hour idle, or
 * an already-revoked session. The boot job deletes a batch once a day.
 *
 * Not the 30-day account purge.
 */
import { log } from "./logger";
import { pruneExpiredSessions } from "../kimi/session";

export const SESSION_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;

async function runOnce(): Promise<void> {
  try {
    const removed = await pruneExpiredSessions();
    if (removed > 0) {
      log.info("session_prune", { removed });
    }
  } catch (error) {
    log.warn("session_prune_failed", {
      error: error instanceof Error ? error.message : "prune failed",
    });
  }
}

/** Boot sweep. Tests do not start it. Account purge is a later card. */
export function startSessionPrune(intervalMs = SESSION_PRUNE_INTERVAL_MS): void {
  if (timer) return;
  void runOnce();
  timer = setInterval(() => {
    void runOnce();
  }, intervalMs);
  timer.unref?.();
}
