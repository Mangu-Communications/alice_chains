import { and, eq, isNull } from "drizzle-orm";
import { aliceCostDaily } from "@db/schema";
import { getDb } from "../queries/connection";

export type AliceCostScope = "instance" | "conversation";

export type AliceCostDelta = {
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
};

export type AliceCostTotals = {
  inputTokens: number;
  outputTokens: number;
  costUSD: string;
};

/** UTC calendar day. Caps reset at midnight UTC (MASTER §7.7). */
export function utcCostDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Midnight UTC for the drizzle `date` column. */
export function utcCostDay(date = utcCostDate()): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function addCostTotals(existing: AliceCostTotals, delta: AliceCostDelta): AliceCostTotals {
  if (!Number.isFinite(delta.costUSD) || delta.costUSD < 0) {
    throw new Error("costUSD must be a non-negative finite number");
  }
  if (!Number.isInteger(delta.inputTokens) || delta.inputTokens < 0) {
    throw new Error("inputTokens must be a non-negative integer");
  }
  if (!Number.isInteger(delta.outputTokens) || delta.outputTokens < 0) {
    throw new Error("outputTokens must be a non-negative integer");
  }
  return {
    inputTokens: existing.inputTokens + delta.inputTokens,
    outputTokens: existing.outputTokens + delta.outputTokens,
    costUSD: (Number(existing.costUSD) + delta.costUSD).toFixed(6),
  };
}

type CostDb = ReturnType<typeof getDb>;

function scopeWhere(scope: AliceCostScope, scopeId: number | null, date: string) {
  const scopeMatch = and(eq(aliceCostDaily.scope, scope), eq(aliceCostDaily.date, utcCostDay(date)));
  if (scope === "instance") return and(scopeMatch, isNull(aliceCostDaily.scopeId));
  return and(scopeMatch, eq(aliceCostDaily.scopeId, scopeId!));
}

export async function readAliceDailyCost(
  db: CostDb,
  input: { scope: AliceCostScope; scopeId?: number | null; date: string },
) {
  const scopeId = input.scope === "instance" ? null : input.scopeId;
  if (input.scope === "conversation" && (scopeId == null || !Number.isInteger(scopeId))) {
    throw new Error("conversation cost requires an integer scopeId");
  }
  const rows = await db
    .select()
    .from(aliceCostDaily)
    .where(scopeWhere(input.scope, scopeId ?? null, input.date))
    .limit(1);
  return rows[0] ?? null;
}

/** Insert or add to the UTC daily row. Does not call the model or enforce caps. */
export async function recordAliceDailyCost(
  db: CostDb,
  input: {
    scope: AliceCostScope;
    scopeId?: number | null;
    date?: string;
    inputTokens: number;
    outputTokens: number;
    costUSD: number;
  },
) {
  const date = input.date ?? utcCostDate();
  const scopeId = input.scope === "instance" ? null : input.scopeId;
  if (input.scope === "conversation" && (scopeId == null || !Number.isInteger(scopeId))) {
    throw new Error("conversation cost requires an integer scopeId");
  }
  const existing = await readAliceDailyCost(db, { scope: input.scope, scopeId, date });
  const next = addCostTotals(
    existing ?? { inputTokens: 0, outputTokens: 0, costUSD: "0.000000" },
    input,
  );
  if (existing) {
    await db
      .update(aliceCostDaily)
      .set({
        inputTokens: next.inputTokens,
        outputTokens: next.outputTokens,
        costUSD: next.costUSD,
      })
      .where(eq(aliceCostDaily.id, existing.id));
    return { id: existing.id, date, scope: input.scope, scopeId, ...next };
  }
  const inserted = await db.insert(aliceCostDaily).values({
    date: utcCostDay(date),
    scope: input.scope,
    scopeId,
    inputTokens: next.inputTokens,
    outputTokens: next.outputTokens,
    costUSD: next.costUSD,
  });
  const id = Number(inserted[0].insertId);
  return { id, date, scope: input.scope, scopeId, ...next };
}

/** MASTER §7.7. Same note for the conversation cap and the instance cap. */
export const ALICE_LIMIT_NOTE =
  "I've reached my response limit for this conversation today. An admin can reset it.";

/** MASTER §2.1 input price. Output is 5x that rate; not an operator secret. */
export const ALICE_INPUT_USD_PER_MILLION = 0.25;
export const ALICE_OUTPUT_USD_PER_MILLION = 1.25;

const DEFAULT_DAILY_CAP_USD = 1;
const DEFAULT_CONV_DAILY_CAP_USD = 0.1;

function readNonNegativeCap(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value;
}

/** Instance-wide daily cap. Empty or invalid env keeps the §7.7 default. */
export function readAliceDailyCapUsd(env: Record<string, string | undefined> = process.env): number {
  const raw = env === process.env ? process.env.ALICE_DAILY_CAP_USD : env.ALICE_DAILY_CAP_USD;
  return readNonNegativeCap(raw, DEFAULT_DAILY_CAP_USD);
}

/** Per-conversation daily cap. Empty or invalid env keeps the §7.7 default. */
export function readAliceConvDailyCapUsd(env: Record<string, string | undefined> = process.env): number {
  const raw = env === process.env ? process.env.ALICE_CONV_DAILY_CAP_USD : env.ALICE_CONV_DAILY_CAP_USD;
  return readNonNegativeCap(raw, DEFAULT_CONV_DAILY_CAP_USD);
}

/** True when today's stored total has reached the cap. Missing row is zero. */
export function aliceCostReachesCap(costUSD: string | number | null | undefined, capUSD: number): boolean {
  if (!Number.isFinite(capUSD) || capUSD < 0) return false;
  if (costUSD == null || costUSD === "") return 0 >= capUSD;
  const spent = Number(costUSD);
  if (!Number.isFinite(spent) || spent < 0) return false;
  return spent >= capUSD;
}

/** Provider token counts to USD. Null usage counts as zero so a bad payload cannot invent spend. */
export function aliceCompletionCostUSD(inputTokens: number | null, outputTokens: number | null): number {
  const input = Number.isInteger(inputTokens) && (inputTokens ?? 0) > 0 ? inputTokens! : 0;
  const output = Number.isInteger(outputTokens) && (outputTokens ?? 0) > 0 ? outputTokens! : 0;
  const cost =
    (input * ALICE_INPUT_USD_PER_MILLION + output * ALICE_OUTPUT_USD_PER_MILLION) / 1_000_000;
  return Number(cost.toFixed(6));
}
