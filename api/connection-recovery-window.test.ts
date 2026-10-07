import { describe, expect, it } from "vitest";
import { CONNECTION_RECOVERY_MS } from "./socket";

describe("P4-001 recovery window", () => {
  it("keeps a dropped socket resumable for two minutes, covering a 5s drop", () => {
    expect(CONNECTION_RECOVERY_MS).toBe(120_000);
    expect(CONNECTION_RECOVERY_MS).toBeGreaterThanOrEqual(5_000);
  });
});
