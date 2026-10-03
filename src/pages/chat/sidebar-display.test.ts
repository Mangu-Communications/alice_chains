/**
 * S-0 slice 2 — pins the sidebar row decisions extracted from Chat.tsx.
 */
import { describe, expect, it } from "vitest";
import {
  conversationPreview,
  directPeerIsOnline,
  unreadBadgeText,
} from "./sidebar-display";

const online = (id: number) => id === 2;

describe("directPeerIsOnline", () => {
  it("shows the dot only for a direct peer who is online", () => {
    expect(
      directPeerIsOnline("direct", [{ userId: 1 }, { userId: 2 }], 1, online),
    ).toBe(true);
  });

  it("hides the dot for groups and for an offline peer", () => {
    expect(
      directPeerIsOnline("group", [{ userId: 1 }, { userId: 2 }], 1, online),
    ).toBe(false);
    expect(
      directPeerIsOnline("direct", [{ userId: 1 }, { userId: 3 }], 1, online),
    ).toBe(false);
  });

  it("does not treat the caller as the online peer", () => {
    expect(directPeerIsOnline("direct", [{ userId: 2 }], 2, online)).toBe(false);
  });
});

describe("conversationPreview", () => {
  it("prefixes the caller's own latest message", () => {
    expect(
      conversationPreview({ content: "hello", senderId: 4 }, 4, "empty"),
    ).toBe("You: hello");
  });

  it("leaves another member's message unprefixed", () => {
    expect(
      conversationPreview({ content: "hello", senderId: 9 }, 4, "empty"),
    ).toBe("hello");
  });

  it("uses the empty label when there is no latest message", () => {
    expect(conversationPreview(null, 4, "No messages yet")).toBe(
      "No messages yet",
    );
  });
});

describe("unreadBadgeText", () => {
  it("shows the count, and 99+ past ninety-nine", () => {
    expect(unreadBadgeText(1)).toBe("1");
    expect(unreadBadgeText(99)).toBe("99");
    expect(unreadBadgeText(100)).toBe("99+");
  });
});
