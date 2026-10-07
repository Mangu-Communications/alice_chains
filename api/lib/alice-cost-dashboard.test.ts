import { describe, expect, it } from "vitest";
import { buildAliceCostDashboard, aliceCostBarPercent, aliceCostWindow } from "./alice-cost-dashboard";

describe("A1-012 admin cost dashboard", () => {
  it("fills a 30-day instance series and sums conversation rows", () => {
    const dashboard = buildAliceCostDashboard({
      today: "2026-10-07",
      names: { 4: "Ops" },
      rows: [
        {
          date: "2026-10-07",
          scope: "instance",
          scopeId: null,
          costUSD: "0.100000",
          inputTokens: 10,
          outputTokens: 2,
        },
        {
          date: "2026-10-06",
          scope: "conversation",
          scopeId: 4,
          costUSD: "0.040000",
          inputTokens: 4,
          outputTokens: 1,
        },
        {
          date: "2026-10-07",
          scope: "conversation",
          scopeId: 4,
          costUSD: "0.060000",
          inputTokens: 6,
          outputTokens: 1,
        },
        {
          date: "2026-09-01",
          scope: "instance",
          scopeId: null,
          costUSD: "9.000000",
          inputTokens: 1,
          outputTokens: 1,
        },
        {
          date: "2026-10-05",
          scope: "conversation",
          scopeId: 9,
          costUSD: "0.010000",
          inputTokens: 1,
          outputTokens: 0,
        },
      ],
      invokes: [
        { detail: JSON.stringify({ modelVersion: "claude-haiku-4-5", costUSD: 0.04 }) },
        { detail: JSON.stringify({ modelVersion: "claude-haiku-4-5", costUSD: 0.06 }) },
        { detail: "not-json" },
        { detail: JSON.stringify({ costUSD: 1 }) },
      ],
    });

    expect(aliceCostWindow("2026-10-07")).toHaveLength(30);
    expect(dashboard.daily).toHaveLength(30);
    expect(dashboard.daily[0]?.date).toBe("2026-09-08");
    expect(dashboard.daily.at(-1)).toEqual({ date: "2026-10-07", costUSD: "0.100000" });
    expect(dashboard.instanceTodayUSD).toBe("0.100000");
    expect(dashboard.daily.find((day) => day.date === "2026-09-01")).toBeUndefined();
    expect(dashboard.conversations).toEqual([
      {
        conversationId: 4,
        name: "Ops",
        costUSD: "0.100000",
        inputTokens: 10,
        outputTokens: 2,
      },
      {
        conversationId: 9,
        name: "Conversation 9",
        costUSD: "0.010000",
        inputTokens: 1,
        outputTokens: 0,
      },
    ]);
    expect(dashboard.models).toEqual([
      { modelVersion: "claude-haiku-4-5", costUSD: "0.100000", invokes: 2 },
    ]);
    expect(aliceCostBarPercent("0.100000", "0.100000")).toBe(100);
    expect(aliceCostBarPercent("0", "0.100000")).toBe(0);
  });
});
