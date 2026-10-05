/**
 * P-CALL-1 — WebRTC signaling relay.
 *
 * The server forwards offer, answer, ICE, and hangup to the other member of
 * the conversation. It does not place media, and it does not open the call UI.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Socket as ClientSocket } from "socket.io-client";
import { callOfferSchema } from "@contracts/socket-events";
import {
  blockUser,
  createConversation,
  createUser,
  describeIntegration,
  resetDatabase,
} from "../test/support/db";
import {
  connectAs,
  disconnectAll,
  nextEvent,
  settle,
  startSocketServer,
  type TestServer,
} from "../test/support/socket";

describe("call signaling schemas (P-CALL-1)", () => {
  it("accepts an audio offer and rejects a self-sized SDP", () => {
    expect(
      callOfferSchema.safeParse({
        conversationId: 1,
        callId: "call-1",
        targetUserId: 2,
        sdp: "v=0",
        kind: "audio",
      }).success
    ).toBe(true);
    expect(
      callOfferSchema.safeParse({
        conversationId: 1,
        callId: "call-1",
        targetUserId: 2,
        sdp: "v=0",
        kind: "carrier-pigeon",
      }).success
    ).toBe(false);
    expect(
      callOfferSchema.safeParse({
        conversationId: 1,
        callId: "call-1",
        targetUserId: 2,
        sdp: "x".repeat(32_001),
        kind: "video",
      }).success
    ).toBe(false);
  });
});

describeIntegration("call signaling relay (P-CALL-1)", () => {
  let server: TestServer;
  let alice: Awaited<ReturnType<typeof createUser>>;
  let bob: Awaited<ReturnType<typeof createUser>>;
  let stranger: Awaited<ReturnType<typeof createUser>>;
  let conversation: number;
  const open: ClientSocket[] = [];

  beforeAll(async () => {
    server = await startSocketServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser({ name: "Alice" });
    bob = await createUser({ name: "Bob" });
    stranger = await createUser({ name: "Stranger" });
    conversation = await createConversation([alice.id, bob.id]);
  });

  afterEach(async () => {
    await disconnectAll(...open.splice(0));
  });

  async function connect(user: typeof alice) {
    const socket = await connectAs(server.port, user);
    open.push(socket);
    return socket;
  }

  const offer = {
    sdp: "v=0",
    kind: "audio" as const,
  };

  it("relays an offer to the other member and not to an outsider", async () => {
    const caller = await connect(alice);
    const callee = await connect(bob);
    const outsider = await connect(stranger);

    const delivered = nextEvent<{
      fromUserId: number;
      targetUserId: number;
      callId: string;
      sdp: string;
      kind: string;
    }>(callee, "callOffer");
    let leaked = false;
    outsider.on("callOffer", () => {
      leaked = true;
    });

    caller.emit("callOffer", {
      conversationId: conversation,
      callId: "call-1",
      targetUserId: bob.id,
      ...offer,
    });

    await expect(delivered).resolves.toMatchObject({
      fromUserId: alice.id,
      targetUserId: bob.id,
      callId: "call-1",
      sdp: "v=0",
      kind: "audio",
    });
    await settle(200);
    expect(leaked).toBe(false);
  });

  it("tells the caller when the target has no socket", async () => {
    const caller = await connect(alice);
    const refused = nextEvent<{ callId: string; code: string }>(caller, "callError");

    caller.emit("callOffer", {
      conversationId: conversation,
      callId: "call-offline",
      targetUserId: bob.id,
      ...offer,
    });

    await expect(refused).resolves.toEqual({ callId: "call-offline", code: "CALL_OFFLINE" });
  });

  it("does not relay to a non-member or to yourself", async () => {
    const caller = await connect(alice);
    const outsider = await connect(stranger);
    let echoed = false;
    caller.on("callOffer", () => {
      echoed = true;
    });
    outsider.on("callOffer", () => {
      echoed = true;
    });

    caller.emit("callOffer", {
      conversationId: conversation,
      callId: "call-self",
      targetUserId: alice.id,
      ...offer,
    });
    caller.emit("callOffer", {
      conversationId: conversation,
      callId: "call-stranger",
      targetUserId: stranger.id,
      ...offer,
    });

    await settle(250);
    expect(echoed).toBe(false);
    expect(outsider.connected).toBe(true);
  });

  it("does not relay across a block, and does answer and hangup when clear", async () => {
    await blockUser(bob, alice);
    const caller = await connect(alice);
    const callee = await connect(bob);
    let blockedDelivered = false;
    callee.on("callOffer", () => {
      blockedDelivered = true;
    });

    caller.emit("callOffer", {
      conversationId: conversation,
      callId: "call-blocked",
      targetUserId: bob.id,
      ...offer,
    });
    await settle(250);
    expect(blockedDelivered).toBe(false);

    await disconnectAll(...open.splice(0));
    await resetDatabase();
    alice = await createUser({ name: "Alice" });
    bob = await createUser({ name: "Bob" });
    conversation = await createConversation([alice.id, bob.id]);

    const answerer = await connect(bob);
    const origin = await connect(alice);
    const answered = nextEvent<{ fromUserId: number; sdp: string }>(origin, "callAnswer");
    answerer.emit("callAnswer", {
      conversationId: conversation,
      callId: "call-2",
      targetUserId: alice.id,
      sdp: "v=answer",
    });
    await expect(answered).resolves.toMatchObject({ fromUserId: bob.id, sdp: "v=answer" });

    const ended = nextEvent<{ reason?: string }>(answerer, "callEnd");
    origin.emit("callEnd", {
      conversationId: conversation,
      callId: "call-2",
      targetUserId: bob.id,
      reason: "hangup",
    });
    await expect(ended).resolves.toMatchObject({ reason: "hangup" });
  });

  it("rejects a malformed offer without disconnecting", async () => {
    const caller = await connect(alice);
    const refused = nextEvent<{ event: string }>(caller, "invalidPayload");
    caller.emit("callOffer", { conversationId: conversation, sdp: "v=0" });
    await expect(refused).resolves.toMatchObject({ event: "callOffer" });
    expect(caller.connected).toBe(true);
  });
});
