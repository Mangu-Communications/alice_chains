import { describe, expect, it } from "vitest";
import { clipAnnouncement, incomingMessageAnnouncement } from "./message-announce";

describe("incoming message announcements (P-A11Y-2)", () => {
  it("does not announce the sender's own message", () => {
    expect(
      incomingMessageAnnouncement({
        senderId: 4,
        selfId: 4,
        senderName: "Ada",
        content: "hello",
      }),
    ).toBeNull();
  });

  it("announces who sent it and a short excerpt", () => {
    expect(
      incomingMessageAnnouncement({
        senderId: 4,
        selfId: 9,
        senderName: "Ada",
        content: "  hello\nthere  ",
      }),
    ).toBe("New message from Ada. hello there");
  });

  it("truncates a long body so the live region stays one sentence", () => {
    const spoken = incomingMessageAnnouncement({
      senderId: 4,
      selfId: 9,
      senderName: "Ada",
      content: "a".repeat(140),
    });
    expect(spoken).toBe(`New message from Ada. ${"a".repeat(119)}…`);
    expect(clipAnnouncement("a".repeat(140)).endsWith("…")).toBe(true);
  });

  it("names an attachment when the body is empty", () => {
    expect(
      incomingMessageAnnouncement({
        senderId: 4,
        selfId: 9,
        senderName: "Ada",
        content: " ",
        attachmentCount: 1,
      }),
    ).toBe("New message from Ada. Sent an attachment.");
    expect(
      incomingMessageAnnouncement({
        senderId: 4,
        selfId: 9,
        senderName: "",
        content: "",
        attachmentCount: 2,
      }),
    ).toBe("New message from someone. Sent an attachment.");
  });

  it("still names the sender when a text message has no body", () => {
    expect(
      incomingMessageAnnouncement({
        senderId: 4,
        selfId: undefined,
        senderName: null,
        content: "",
      }),
    ).toBe("New message from someone");
  });
});
