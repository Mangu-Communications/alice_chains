/**
 * P-CALL-6 — incoming-call push on the existing web-push path.
 *
 * An offer to a member with no socket still wakes them. Off stays off.
 * Mentions-only still rings, because a call is directed at that member.
 * No VAPID secret is created here.
 */
import { afterEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { conversationParticipants, pushSubscriptions } from "@db/schema";
import {
  createConversation,
  createUser,
  describeIntegration,
  resetDatabase,
} from "../test/support/db";
import { getDb } from "./queries/connection";
import { appRouter } from "./router";
import {
  incomingCallCopy,
  notifyIncomingCall,
  wantsCallNotification,
} from "./lib/push/notify";

type Row = Awaited<ReturnType<typeof createUser>>;
const caller = (user: Row) => appRouter.createCaller({ user });

const SUBSCRIPTION = {
  p256dh:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
};

it("names an incoming voice or video call without leaking a secret", () => {
  expect(incomingCallCopy("audio", "Alice")).toEqual({
    title: "Alice",
    body: "Incoming voice call",
  });
  expect(incomingCallCopy("video", "  ")).toEqual({
    title: "Someone",
    body: "Incoming video call",
  });
  expect(wantsCallNotification("all")).toBe(true);
  expect(wantsCallNotification("mentions")).toBe(true);
  expect(wantsCallNotification("off")).toBe(false);
});

describeIntegration("incoming call push (P-CALL-6)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("pushes a high-urgency offer to a subscribed callee", async () => {
    await resetDatabase();
    const alice = await createUser({ name: "Alice" });
    const bob = await createUser({ name: "Bob" });
    const conversation = await createConversation([alice.id, bob.id]);
    await caller(bob).push.subscribe({
      endpoint: "https://push.example.test/bob",
      ...SUBSCRIPTION,
    });

    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchImpl);

    await notifyIncomingCall({
      conversationId: conversation,
      callId: "call-1",
      callerId: alice.id,
      callerName: "Alice",
      calleeId: bob.id,
      kind: "video",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>;
    const headers = new Headers(calls[0][1].headers);
    expect(headers.get("urgency")).toBe("high");
    expect(headers.get("authorization")).toMatch(/^vapid /);
    expect(await getDb().select().from(pushSubscriptions)).toHaveLength(1);
  });

  it("does not push when the callee turned the conversation off", async () => {
    await resetDatabase();
    const alice = await createUser({ name: "Alice" });
    const bob = await createUser({ name: "Bob" });
    const conversation = await createConversation([alice.id, bob.id]);
    await caller(bob).push.subscribe({
      endpoint: "https://push.example.test/bob",
      ...SUBSCRIPTION,
    });
    await getDb()
      .update(conversationParticipants)
      .set({ notifyLevel: "off" })
      .where(eq(conversationParticipants.userId, bob.id));

    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchImpl);

    await notifyIncomingCall({
      conversationId: conversation,
      callId: "call-off",
      callerId: alice.id,
      callerName: "Alice",
      calleeId: bob.id,
      kind: "audio",
    });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not push a non-member or the caller", async () => {
    await resetDatabase();
    const alice = await createUser({ name: "Alice" });
    const bob = await createUser({ name: "Bob" });
    const stranger = await createUser({ name: "Stranger" });
    const conversation = await createConversation([alice.id, bob.id]);
    await caller(stranger).push.subscribe({
      endpoint: "https://push.example.test/stranger",
      ...SUBSCRIPTION,
    });
    await caller(alice).push.subscribe({
      endpoint: "https://push.example.test/alice",
      ...SUBSCRIPTION,
    });

    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchImpl);

    await notifyIncomingCall({
      conversationId: conversation,
      callId: "call-stranger",
      callerId: alice.id,
      callerName: "Alice",
      calleeId: stranger.id,
      kind: "audio",
    });
    await notifyIncomingCall({
      conversationId: conversation,
      callId: "call-self",
      callerId: alice.id,
      callerName: "Alice",
      calleeId: alice.id,
      kind: "audio",
    });

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
