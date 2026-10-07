import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addAliceCost, aliceCostKey, emptyAliceCost, utcDateString } from "./alice-cost";

const migration = readFileSync(
  new URL("../../db/migrations/0012_alice_cost_daily.sql", import.meta.url),
  "utf8",
);

describe("A1-001 alice_cost_daily", () => {
  it("creates the §7.12 table with the scope/date unique key", () => {
    expect(migration).toMatch(/CREATE TABLE `alice_cost_daily`/);
    expect(migration).toMatch(/`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY/);
    expect(migration).toMatch(/`date` DATE NOT NULL/);
    expect(migration).toMatch(/`scope` ENUM\('instance','conversation'\) NOT NULL/);
    expect(migration).toMatch(/`scopeId` BIGINT UNSIGNED NULL/);
    expect(migration).toMatch(/`inputTokens` INT UNSIGNED NOT NULL DEFAULT 0/);
    expect(migration).toMatch(/`outputTokens` INT UNSIGNED NOT NULL DEFAULT 0/);
    expect(migration).toMatch(/`costUSD` DECIMAL\(10,6\) NOT NULL DEFAULT 0/);
    expect(migration).toMatch(
      /UNIQUE KEY `alice_cost_daily_scope_date_uq` \(`scope`, `scopeId`, `date`\)/,
    );
  });

  it("keys instance spend by UTC date and a null scope id", () => {
    expect(utcDateString(new Date("2026-10-06T23:30:00.000Z"))).toBe("2026-10-06");
    expect(utcDateString(new Date("2026-10-07T00:00:00.000Z"))).toBe("2026-10-07");
    expect(aliceCostKey("instance", null, "2026-10-06")).toEqual({
      scope: "instance",
      scopeId: null,
      date: "2026-10-06",
    });
    expect(aliceCostKey("conversation", 12, "2026-10-06").scopeId).toBe(12);
    expect(() => aliceCostKey("instance", 1, "2026-10-06")).toThrow(/null/);
    expect(() => aliceCostKey("conversation", null, "2026-10-06")).toThrow(/positive integer/);
  });

  it("accumulates tokens and cost on the daily row", () => {
    const row = addAliceCost(emptyAliceCost(aliceCostKey("conversation", 4, "2026-10-06")), {
      inputTokens: 100,
      outputTokens: 20,
      costUSD: 0.000125,
    });
    const next = addAliceCost(row, { inputTokens: 50, outputTokens: 10, costUSD: 0.000075 });
    expect(next).toEqual({
      scope: "conversation",
      scopeId: 4,
      date: "2026-10-06",
      inputTokens: 150,
      outputTokens: 30,
      costUSD: 0.0002,
    });
    expect(() => addAliceCost(row, { inputTokens: -1, outputTokens: 0, costUSD: 0 })).toThrow(
      /inputTokens/,
    );
  });
});
