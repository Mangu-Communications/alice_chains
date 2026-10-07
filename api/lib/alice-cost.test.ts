import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addCostTotals, recordAliceDailyCost, utcCostDate } from "./alice-cost";

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
