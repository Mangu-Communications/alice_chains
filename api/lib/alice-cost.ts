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
