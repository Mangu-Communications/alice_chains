/**
 * P4-002. MASTER G4: a double-tap send with the same clientMessageId stores one message.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { Socket as ClientSocket } from "socket.io-client";
import { and, eq } from "drizzle-orm";
import { messages } from "@db/schema";
import {
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
import { getDb } from "./queries/connection";

type Row = Awaited<ReturnType<typeof createUser>>;

describeIntegration("outbox idempotency (P4-002)", () => {
  let server: TestServer;
  let alice: Row;
  let bob: Row;
  let conversation: number;
  const open: ClientSocket[] = [];

  beforeAll(async () => {
    await resetDatabase();
    server = await startSocketServer();
  });

  afterAll(async () => {
    disconnectAll(...open);
    await server.close();
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    alice = await createUser({ name: "Alice" });
    bob = await createUser({ name: "Bob" });
    conversation = await createConversation([alice.id, bob.id]);
  });

  afterEach(async () => {
    disconnectAll(...open.splice(0));
    await settle(50);
  });

  async function joined(user: Row) {
    const socket = await connectAs(server.port, user);
    open.push(socket);
    socket.emit("joinConversation", { conversationId: conversation });
    await settle(200);
    return socket;
  }

  it("stores one row when the same clientMessageId is sent twice", async () => {
    const sender = await joined(alice);
    const receiver = await joined(bob);
    const clientMessageId = "11111111-1111-4111-8111-111111111111";

    const first = nextEvent<{ id: number; clientMessageId?: string }>(receiver, "newMessage");
    sender.emit("sendMessage", {
      conversationId: conversation,
      content: "once",
      clientMessageId,
    });
    const delivered = await first;
    expect(delivered.clientMessageId).toBe(clientMessageId);

    const echoed = nextEvent<{ id: number; clientMessageId?: string }>(sender, "newMessage");
    let secondBroadcast = false;
    receiver.once("newMessage", () => {
      secondBroadcast = true;
    });
    sender.emit("sendMessage", {
      conversationId: conversation,
      content: "once",
      clientMessageId,
    });
    const replay = await echoed;
    expect(replay.id).toBe(delivered.id);
    expect(replay.clientMessageId).toBe(clientMessageId);

    await settle(50);
    expect(secondBroadcast).toBe(false);

    const rows = await getDb()
      .select()
      .from(messages)
      .where(
        and(eq(messages.conversationId, conversation), eq(messages.clientMessageId, clientMessageId))
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("once");
    expect(rows[0].senderId).toBe(alice.id);
  });
});
