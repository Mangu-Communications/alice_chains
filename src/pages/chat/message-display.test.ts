/**
 * S-0 slice 3 — pins the message-log decisions extracted from Chat.tsx.
 */
import { describe, expect, it } from "vitest";
import {
  isFirstInSenderGroup,
  pendingSendLabel,
  receiptIsRead,
  replyAuthorLabel,
  replyPreviewText,
  showSenderAvatar,
} from "./message-display";

describe("showSenderAvatar", () => {
  it("shows an avatar on the first message from someone else", () => {
    expect(showSenderAvatar(false, 0, undefined, 7)).toBe(true);
  });

  it("hides the avatar on own rows and on a continued run", () => {
    expect(showSenderAvatar(true, 0, undefined, 1)).toBe(false);
    expect(showSenderAvatar(false, 2, 7, 7)).toBe(false);
  });

  it("shows the avatar again when the sender changes", () => {
    expect(showSenderAvatar(false, 3, 7, 8)).toBe(true);
  });
});

describe("isFirstInSenderGroup", () => {
  it("treats the first row and a sender change as a new group", () => {
    expect(isFirstInSenderGroup(0, undefined, 4)).toBe(true);
    expect(isFirstInSenderGroup(2, 4, 9)).toBe(true);
    expect(isFirstInSenderGroup(2, 4, 4)).toBe(false);
  });
});

describe("replyAuthorLabel", () => {
  it("uses You for the caller and Unknown when the name is missing", () => {
    expect(replyAuthorLabel(3, 3, "Ada")).toBe("You");
    expect(replyAuthorLabel(4, 3, null)).toBe("Unknown");
    expect(replyAuthorLabel(4, 3, "Ada")).toBe("Ada");
  });
});

describe("replyPreviewText", () => {
  it("keeps the deleted copy and otherwise shows the parent content", () => {
    expect(replyPreviewText("2026-10-03", "gone")).toBe("Message deleted");
    expect(replyPreviewText(null, "still here")).toBe("still here");
    expect(replyPreviewText(null, null)).toBe("");
  });
});

describe("receiptIsRead", () => {
  it("is read only when a receipt exists", () => {
    expect(receiptIsRead(0)).toBe(false);
    expect(receiptIsRead(1)).toBe(true);
  });
});

describe("pendingSendLabel", () => {
  it("matches the connected and offline captions", () => {
    expect(pendingSendLabel(true)).toBe("Sending…");
    expect(pendingSendLabel(false)).toBe("Waiting to send");
  });
});
