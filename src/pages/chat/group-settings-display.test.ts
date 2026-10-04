/**
 * S-0 slice 5 — pins the group settings decisions extracted from Chat.tsx.
 */
import { describe, expect, it } from "vitest";
import {
  memberCountLabel,
  renameSaveDisabled,
  showLeaveTransferHint,
} from "./group-settings-display";

describe("renameSaveDisabled", () => {
  it("enables save only for an owner with a new non-empty name", () => {
    expect(renameSaveDisabled(true, false, "  Renamed  ", "Old")).toBe(false);
  });

  it("disables save for non-owners, in-flight saves, blanks, and the current name", () => {
    expect(renameSaveDisabled(false, false, "Renamed", "Old")).toBe(true);
    expect(renameSaveDisabled(true, true, "Renamed", "Old")).toBe(true);
    expect(renameSaveDisabled(true, false, "   ", "Old")).toBe(true);
    expect(renameSaveDisabled(true, false, " Old ", "Old")).toBe(true);
  });
});

describe("showLeaveTransferHint", () => {
  it("shows the transfer hint only when the owner is not alone", () => {
    expect(showLeaveTransferHint(true, 2)).toBe(true);
    expect(showLeaveTransferHint(true, 1)).toBe(false);
    expect(showLeaveTransferHint(false, 3)).toBe(false);
  });
});

describe("memberCountLabel", () => {
  it("keeps the parenthetical count the dialog used", () => {
    expect(memberCountLabel(0)).toBe("Members (0)");
    expect(memberCountLabel(4)).toBe("Members (4)");
  });
});
