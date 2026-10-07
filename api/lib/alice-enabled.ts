/**
 * A1-015. Instance kill switch is the ALICE_ENABLED env var (MASTER App. A).
 * Empty stays enabled. false | 0 | off | no stops invocations.
 * A DB feature_flags row is later (App. A v1.1) and is not this card.
 * Existing participant rows are retained; this module does not delete them.
 */
export function readAliceEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = (env === process.env ? process.env.ALICE_ENABLED : env.ALICE_ENABLED)?.trim().toLowerCase() ?? "";
  return raw !== "false" && raw !== "0" && raw !== "off" && raw !== "no";
}

/** What an Alice invocation path should do. Membership rows are not touched. */
export function planAliceKillSwitch(enabled: boolean): "invoke" | "skip" {
  return enabled ? "invoke" : "skip";
}
