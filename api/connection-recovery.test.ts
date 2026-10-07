/**
 * P4-001. Socket.IO connection state recovery.
 *
 * A message emitted into the open conversation during a short unexpected
 * disconnect is delivered when the same client resumes. A clean
 * `socket.disconnect()` does not resume — Socket.IO discards that session.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { io as connect, type Socket as ClientSocket } from "socket.io-client";
import {
  createConversation,
  createUser,
  describeIntegration,
  resetDatabase,
} from "../test/support/db";
import {
  disconnectAll,
  nextEvent,
  sessionCookieFor,
  settle,
  startSocketServer,
  type TestServer,
} from "../test/support/socket";

type Row = Awaited<ReturnType<typeof createUser>>;

function waitForConnect(socket: ClientSocket, ms = 8000) {
  return new Promise<void>((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      socket.off("connect", onConnect);
      reject(new Error("timed out waiting for reconnect"));
    }, ms);
    const onConnect = () => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      resolve();
    };
    socket.on("connect", onConnect);
  });
}

describeIntegration("P4-001 connection state recovery", () => {
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
    await settle(150);
  });

  async function connectRecoverable(user: Row) {
    const cookie = await sessionCookieFor(user);
    const socket = await new Promise<ClientSocket>((resolve, reject) => {
      const client = connect(`http://127.0.0.1:${server.port}`, {
        transports: ["websocket"],
        extraHeaders: { cookie },
        reconnection: false,
        forceNew: true,
      });
      const timer = setTimeout(() => reject(new Error("connect timed out")), 8000);
      client.on("connect", () => {
        clearTimeout(timer);
        resolve(client);
      });
      client.on("connect_error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    open.push(socket);
    return socket;
  }

  it("delivers a message sent during a 5s drop after the socket resumes", async () => {
    const sender = await connectRecoverable(alice);
    const receiver = await connectRecoverable(bob);
    sender.emit("joinConversation", { conversationId: conversation });
    receiver.emit("joinConversation", { conversationId: conversation });
    await settle(200);

    receiver.io.engine.close();
    await settle(5000);

    const delivered = nextEvent<{ content: string; senderId: number }>(receiver, "newMessage", 8000);
    sender.emit("sendMessage", {
      conversationId: conversation,
      content: "still here after the drop",
    });
    receiver.connect();
    await waitForConnect(receiver);

    expect(receiver.recovered).toBe(true);
    await expect(delivered).resolves.toMatchObject({
      content: "still here after the drop",
      senderId: alice.id,
    });
  });
});
