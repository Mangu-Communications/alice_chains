import { describe, expect, it } from "vitest";
import {
  CONNECTION_RECOVERY_MS,
  shouldRefetchOpenThread,
  shouldRejoinOpenConversation,
} from "./connection-recovery";

describe("P4-001 connection recovery", () => {
  it("keeps a two-minute window, long enough for a 5s drop", () => {
    expect(CONNECTION_RECOVERY_MS).toBeGreaterThanOrEqual(5_000);
    expect(CONNECTION_RECOVERY_MS).toBe(120_000);
  });

  it("rejoins only when a conversation is open", () => {
    expect(shouldRejoinOpenConversation(null)).toBe(false);
    expect(shouldRejoinOpenConversation(14)).toBe(true);
  });

  it("refetches the open thread only after a connect that did not recover", () => {
    expect(shouldRefetchOpenThread({ connectionEpoch: 1, recovered: false })).toBe(false);
    expect(shouldRefetchOpenThread({ connectionEpoch: 2, recovered: true })).toBe(false);
    expect(shouldRefetchOpenThread({ connectionEpoch: 2, recovered: false })).toBe(true);
  });
});
