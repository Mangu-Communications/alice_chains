/**
 * S-0 slice 1 — Chat.tsx display helpers.
 *
 * Pins the expressions that used to live inline in the conversation sidebar
 * and the group-member dialog, so later extractions cannot quietly change
 * who shows an initial, who the name filter keeps, or who can be added.
 */
import { describe, expect, it } from "vitest";
import {
  avatarInitial,
  contactsNotInConversation,
  conversationMatchesQuery,
  isGroupOwner,
  otherDirectMemberId,
} from "./chat-display";

describe("avatarInitial", () => {
  it("uppercases the first character", () => {
    expect(avatarInitial("ada")).toBe("A");
  });

  it("uses ? when the name is missing or empty", () => {
    expect(avatarInitial(undefined)).toBe("?");
    expect(avatarInitial(null)).toBe("?");
    expect(avatarInitial("")).toBe("?");
  });

  it("can render nothing, matching the conversation header", () => {
    expect(avatarInitial(undefined, "")).toBe("");
    expect(avatarInitial("ada", "")).toBe("A");
  });
});

describe("conversationMatchesQuery", () => {
  it("matches case-insensitively", () => {
    expect(conversationMatchesQuery("Design Review", "design")).toBe(true);
    expect(conversationMatchesQuery("Design Review", "nope")).toBe(false);
  });

  it("keeps every named conversation when the query is empty", () => {
    expect(conversationMatchesQuery("Design Review", "")).toBe(true);
  });

  it("drops a conversation with no display name, even for an empty query", () => {
    expect(conversationMatchesQuery(undefined, "")).toBe(false);
    expect(conversationMatchesQuery(null, "a")).toBe(false);
  });
});

describe("otherDirectMemberId", () => {
  const participants = [{ userId: 1 }, { userId: 2 }];

  it("returns the peer in a direct conversation", () => {
    expect(otherDirectMemberId("direct", participants, 1)).toBe(2);
  });

  it("returns null for a group or when there is no participant list", () => {
    expect(otherDirectMemberId("group", participants, 1)).toBe(null);
    expect(otherDirectMemberId("direct", undefined, 1)).toBe(null);
  });

  it("keeps the first participant when the caller id is missing", () => {
    // Same as `participants.find(p => p.userId !== user?.id)` with no user.
    expect(otherDirectMemberId("direct", participants, undefined)).toBe(1);
  });
});

describe("isGroupOwner", () => {
  it("is true only when the conversation is a group created by the caller", () => {
    expect(isGroupOwner("group", 7, 7)).toBe(true);
    expect(isGroupOwner("group", 7, 8)).toBe(false);
    expect(isGroupOwner("direct", 7, 7)).toBe(false);
    expect(isGroupOwner("group", 7, undefined)).toBe(false);
  });
});

describe("contactsNotInConversation", () => {
  it("excludes contacts who are already participants", () => {
    const contacts = [{ contactUserId: 2 }, { contactUserId: 3 }];
    expect(contactsNotInConversation(contacts, [{ userId: 2 }])).toEqual([
      { contactUserId: 3 },
    ]);
  });

  it("returns every contact when there are no participants", () => {
    const contacts = [{ contactUserId: 3 }];
    expect(contactsNotInConversation(contacts, undefined)).toEqual(contacts);
  });
});
