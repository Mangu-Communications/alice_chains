/**
 * P-UX-1 — per-conversation notification preference.
 *
 * Default stays `all`, so existing rooms keep notifying. `off` suppresses
 * push. `mentions` only fires when the body names the member.
 */
import { afterEach, expect, it, vi } from "vitest";
import { pushSubscriptions } from "@db/schema";
import {
  createConversation,
  createUser,
  describeIntegration,
  resetDatabase,
} from "../test/support/db";
import { getDb } from "./queries/connection";
import { appRouter } from "./router";
import { mentionsUser, notifyNewMessage, wantsNotification } from "./lib/push/notify";

type Row = Awaited<ReturnType<typeof createUser>>;
const caller = (user: Row) => appRouter.createCaller({ user });

const SUBSCRIPTION = {
  p256dh:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
};

describeIntegration("notification preferences (P-UX-1)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("defaults to all and stores the caller's choice only", async () => {
    await resetDatabase();
    const alice = await createUser({ name: "Alice" });
    const bob = await createUser({ name: "Bob" });
    const conversation = await createConversation([alice.id, bob.id]);

    const before = await caller(alice).conversation.getById({ id: conversation });
    expect(before?.notifyLevel).toBe("all");

    await caller(alice).conversation.setNotifyLevel({
      conversationId: conversation,
      level: "off",
    });

    const aliceAfter = await caller(alice).conversation.getById({ id: conversation });
    const bobAfter = await caller(bob).conversation.getById({ id: conversation });
    expect(aliceAfter?.notifyLevel).toBe("off");
    expect(bobAfter?.notifyLevel).toBe("all");
    expect(JSON.stringify(aliceAfter?.participants)).not.toContain("notifyLevel");
  });

  it("rejects a non-participant", async () => {
    await resetDatabase();
    const alice = await createUser({ name: "Alice" });
    const bob = await createUser({ name: "Bob" });
    const carol = await createUser({ name: "Carol" });
    const conversation = await createConversation([alice.id, bob.id]);

    await expect(
      caller(carol).conversation.setNotifyLevel({
        conversationId: conversation,
        level: "off",
      })
    ).rejects.toThrow();
  });

  it("does not push when the member turned the conversation off", async () => {
    await resetDatabase();
    const alice = await createUser({ name: "Alice" });
    const bob = await createUser({ name: "Bob" });
    const conversation = await createConversation([alice.id, bob.id], {
      type: "direct",
      createdBy: alice.id,
    });
    await caller(bob).push.subscribe({
      endpoint: "https://push.example.test/bob",
      ...SUBSCRIPTION,
    });
    await caller(bob).conversation.setNotifyLevel({
      conversationId: conversation,
      level: "off",
    });

    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchImpl);

    await notifyNewMessage({
      conversationId: conversation,
      senderId: alice.id,
      senderName: "Alice",
      conversationName: null,
      isGroup: false,
      content: "hello @Bob",
      hasAttachment: false,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await getDb().select().from(pushSubscriptions)).toHaveLength(1);
  });

  it("pushes a mention and skips an unmentioned member on mentions-only", async () => {
    await resetDatabase();
    const alice = await createUser({ name: "Alice" });
    const bob = await createUser({ name: "Bob" });
    const conversation = await createConversation([alice.id, bob.id], {
      type: "group",
      name: "Ops",
      createdBy: alice.id,
    });
    await caller(bob).push.subscribe({
      endpoint: "https://push.example.test/bob",
      ...SUBSCRIPTION,
    });
    await caller(bob).conversation.setNotifyLevel({
      conversationId: conversation,
      level: "mentions",
    });

    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchImpl);

    await notifyNewMessage({
      conversationId: conversation,
      senderId: alice.id,
      senderName: "Alice",
      conversationName: "Ops",
      isGroup: true,
      content: "status check",
      hasAttachment: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    await notifyNewMessage({
      conversationId: conversation,
      senderId: alice.id,
      senderName: "Alice",
      conversationName: "Ops",
      isGroup: true,
      content: "status check @Bob",
      hasAttachment: false,
    });
    expect(fetchImpl).toHaveBeenCalled();
  });
});

it("matches a mention as a whole token", () => {
  expect(mentionsUser("ping @Bob please", "Bob")).toBe(true);
  expect(mentionsUser("ping @bobby", "Bob")).toBe(false);
  expect(mentionsUser("@Bob", "Bob")).toBe(true);
  expect(mentionsUser("hello", "Bob")).toBe(false);
  expect(mentionsUser("@A", "A")).toBe(false);
  expect(wantsNotification("all", "hello", "Bob")).toBe(true);
  expect(wantsNotification("off", "@Bob", "Bob")).toBe(false);
  expect(wantsNotification("mentions", "@Bob", "Bob")).toBe(true);
});
