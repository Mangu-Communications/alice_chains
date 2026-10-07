import { describe, expect, it } from "vitest";
import { aliceCostBarStyle, formatAliceCost } from "./alice-cost-display";

describe("Alice cost dashboard display", () => {
  it("scales the busiest day to full height and prints six decimals", () => {
    expect(aliceCostBarStyle("0.025000", "0.100000")).toEqual({ height: "25%" });
    expect(formatAliceCost("0.100000")).toBe("$0.100000");
  });
});
