import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALICE_LIMIT_NOTE,
  addCostTotals,
  aliceCompletionCostUSD,
  aliceCostReachesCap,
  readAliceConvDailyCapUsd,
  readAliceDailyCapUsd,
  recordAliceDailyCost,
  utcCostDate,
} from "./alice-cost";

describe("A1-001 alice_cost_daily", () => {
  it("declares the §7.12 table in migration 0012", () => {
    const sql = readFileSync("db/migrations/0012_alice_cost_daily.sql", "utf8");
    expect(sql).toContain("CREATE TABLE `alice_cost_daily`");
    expect(sql).toContain("enum('instance','conversation')");
    expect(sql).toContain("`scopeId` bigint unsigned");
    expect(sql).toContain("`costUSD` decimal(10,6)");
    expect(sql).toContain("alice_cost_daily_scope_date_uq");
    const journal = readFileSync("db/migrations/meta/_journal.json", "utf8");
    expect(journal).toContain('"tag": "0012_alice_cost_daily"');
  });

  it("uses the UTC calendar day", () => {
    expect(utcCostDate(new Date("2026-10-07T03:59:00.000Z"))).toBe("2026-10-07");
    expect(utcCostDate(new Date("2026-10-06T23:30:00.000Z"))).toBe("2026-10-06");
  });

  it("adds token and cost totals without dropping scale", () => {
    expect(
      addCostTotals(
        { inputTokens: 10, outputTokens: 2, costUSD: "0.001000" },
        { inputTokens: 5, outputTokens: 3, costUSD: 0.00025 },
      ),
    ).toEqual({ inputTokens: 15, outputTokens: 5, costUSD: "0.001250" });
  });

  it("updates an existing instance row instead of inserting a second NULL scope", async () => {
    const rows: Array<Record<string, unknown>> = [
      {
        id: 4,
        date: "2026-10-06",
        scope: "instance",
        scopeId: null,
        inputTokens: 8,
        outputTokens: 1,
        costUSD: "0.010000",
      },
    ];
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => rows,
          }),
        }),
      }),
      insert: () => {
        throw new Error("instance write should update the existing row");
      },
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            rows[0] = { ...rows[0], ...values };
          },
        }),
      }),
    };
    const saved = await recordAliceDailyCost(db as never, {
      scope: "instance",
      date: "2026-10-06",
      inputTokens: 2,
      outputTokens: 1,
      costUSD: 0.002,
    });
    expect(saved.id).toBe(4);
    expect(saved.scopeId).toBeNull();
    expect(saved.costUSD).toBe("0.012000");
    expect(rows).toHaveLength(1);
  });
});

describe("A1-009 cost cap", () => {
  it("uses the §7.7 defaults and the limit note", () => {
    expect(readAliceConvDailyCapUsd({})).toBe(0.1);
    expect(readAliceDailyCapUsd({})).toBe(1);
    expect(readAliceConvDailyCapUsd({ ALICE_CONV_DAILY_CAP_USD: "nope" })).toBe(0.1);
    expect(readAliceDailyCapUsd({ ALICE_DAILY_CAP_USD: "-1" })).toBe(1);
    expect(readAliceConvDailyCapUsd({ ALICE_CONV_DAILY_CAP_USD: "0.25" })).toBe(0.25);
    expect(ALICE_LIMIT_NOTE).toBe(
      "I've reached my response limit for this conversation today. An admin can reset it.",
    );
  });

  it("refuses when today's total reaches the cap, including a zero cap", () => {
    expect(aliceCostReachesCap(null, 0.1)).toBe(false);
    expect(aliceCostReachesCap("0.099999", 0.1)).toBe(false);
    expect(aliceCostReachesCap("0.100000", 0.1)).toBe(true);
    expect(aliceCostReachesCap("1.000000", 1)).toBe(true);
    expect(aliceCostReachesCap("0.000000", 0)).toBe(true);
  });

  it("prices haiku input at the §2.1 rate", () => {
    expect(aliceCompletionCostUSD(1_000_000, 0)).toBe(0.25);
    expect(aliceCompletionCostUSD(0, 1_000_000)).toBe(1.25);
    expect(aliceCompletionCostUSD(null, null)).toBe(0);
  });

  it("checks the daily totals before the provider call and stores the limit note", () => {
    const src = readFileSync("api/lib/alice-reply.ts", "utf8");
    const body = src.slice(src.indexOf("export async function deliverAliceReply"));
    const cap = body.indexOf("aliceCostReachesCap");
    const call = body.indexOf("requestAliceCompletion");
    const record = body.indexOf("recordAliceDailyCost");
    expect(cap).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(cap);
    expect(record).toBeGreaterThan(call);
    expect(src).toContain("ALICE_LIMIT_NOTE");
    expect(src).toContain('return "capped"');
    const beforeCall = src.slice(0, call);
    expect(beforeCall).toContain("readAliceDailyCost");
    expect(beforeCall).not.toContain("fetch(");
  });
});

