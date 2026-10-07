/**
 * A1-001. Daily Alice cost identity and arithmetic.
 *
 * The table is alice_cost_daily (§7.12). This module is the insert/read key
 * the later cost-cap card will call. It does not call a provider and does not
 * enforce caps (that is A1-009).
 */

export type AliceCostScope = "instance" | "conversation";

export interface AliceCostKey {
  scope: AliceCostScope;
  scopeId: number | null;
  date: string;
}

export interface AliceCostDelta {
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
}

export interface AliceCostRow extends AliceCostKey, AliceCostDelta {}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** UTC calendar date. Caps reset at midnight UTC (§7.7). */
export function utcDateString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function aliceCostKey(
  scope: AliceCostScope,
  scopeId: number | null,
  date: string = utcDateString(),
): AliceCostKey {
  if (!DATE.test(date)) throw new Error("alice cost date must be YYYY-MM-DD");
  if (scope === "instance") {
    if (scopeId != null) throw new Error("instance scopeId must be null");
    return { scope, scopeId: null, date };
  }
  if (scope !== "conversation") throw new Error("unknown alice cost scope");
  if (scopeId == null || !Number.isInteger(scopeId) || scopeId < 1) {
    throw new Error("conversation scopeId must be a positive integer");
  }
  return { scope, scopeId, date };
}

export function emptyAliceCost(key: AliceCostKey): AliceCostRow {
  return { ...key, inputTokens: 0, outputTokens: 0, costUSD: 0 };
}

function assertNonNegativeInt(name: string, value: number) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}

/** Add a provider usage delta onto a daily row. Amounts are not rounded away. */
export function addAliceCost(row: AliceCostRow, delta: AliceCostDelta): AliceCostRow {
  assertNonNegativeInt("inputTokens", delta.inputTokens);
  assertNonNegativeInt("outputTokens", delta.outputTokens);
  if (!Number.isFinite(delta.costUSD) || delta.costUSD < 0) {
    throw new Error("costUSD must be a non-negative finite number");
  }
  return {
    ...row,
    inputTokens: row.inputTokens + delta.inputTokens,
    outputTokens: row.outputTokens + delta.outputTokens,
    costUSD: roundCost(row.costUSD + delta.costUSD),
  };
}

/** DECIMAL(10,6) storage width from §7.12. */
export function roundCost(costUSD: number): number {
  return Math.round(costUSD * 1_000_000) / 1_000_000;
}
