/**
 * A1-001 insert/read path for alice_cost_daily.
 *
 * Instance rows store scopeId NULL. MySQL unique keys do not collapse those
 * NULLs, so this path selects first and then inserts or adds. Cost-cap
 * enforcement is A1-009 and is not done here.
 */
import { and, eq, isNull } from "drizzle-orm";
import { aliceCostDaily } from "@db/schema";
import {
  addAliceCost,
  aliceCostKey,
  emptyAliceCost,
  type AliceCostDelta,
  type AliceCostRow,
  type AliceCostScope,
} from "../../src/lib/alice-cost";
import { getDb } from "./connection";

function toRow(stored: typeof aliceCostDaily.$inferSelect): AliceCostRow {
  return {
    scope: stored.scope,
    scopeId: stored.scopeId,
    date: stored.date,
    inputTokens: stored.inputTokens,
    outputTokens: stored.outputTokens,
    costUSD: Number(stored.costUSD),
  };
}

async function findStored(key: ReturnType<typeof aliceCostKey>) {
  const scopeMatch =
    key.scopeId == null ? isNull(aliceCostDaily.scopeId) : eq(aliceCostDaily.scopeId, key.scopeId);
  const [stored] = await getDb()
    .select()
    .from(aliceCostDaily)
    .where(and(eq(aliceCostDaily.scope, key.scope), scopeMatch, eq(aliceCostDaily.date, key.date)))
    .limit(1);
  return stored ?? null;
}

export async function readAliceCost(
  scope: AliceCostScope,
  scopeId: number | null,
  date: string,
): Promise<AliceCostRow> {
  const key = aliceCostKey(scope, scopeId, date);
  const stored = await findStored(key);
  return stored ? toRow(stored) : emptyAliceCost(key);
}

export async function recordAliceCost(
  scope: AliceCostScope,
  scopeId: number | null,
  date: string,
  delta: AliceCostDelta,
): Promise<AliceCostRow> {
  const key = aliceCostKey(scope, scopeId, date);
  const stored = await findStored(key);
  const next = addAliceCost(stored ? toRow(stored) : emptyAliceCost(key), delta);
  const db = getDb();
  if (!stored) {
    await db.insert(aliceCostDaily).values({
      date: next.date,
      scope: next.scope,
      scopeId: next.scopeId,
      inputTokens: next.inputTokens,
      outputTokens: next.outputTokens,
      costUSD: next.costUSD.toFixed(6),
    });
    return next;
  }
  const scopeMatch =
    next.scopeId == null ? isNull(aliceCostDaily.scopeId) : eq(aliceCostDaily.scopeId, next.scopeId);
  await db
    .update(aliceCostDaily)
    .set({
      inputTokens: next.inputTokens,
      outputTokens: next.outputTokens,
      costUSD: next.costUSD.toFixed(6),
    })
    .where(and(eq(aliceCostDaily.scope, next.scope), scopeMatch, eq(aliceCostDaily.date, next.date)));
  return next;
}
