/**
 * A1-014. Thumbs up/down persist only on Alice messages.
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { aliceMessageRatings } from "@db/schema";
import { createConversation, createMessage, createUser, describeIntegration, resetDatabase } from "../test/support/db";
import { getDb } from "./queries/connection";
import { appRouter } from "./router";

type Row = Awaited<ReturnType<typeof createUser>>;
const caller = (user: Row) => appRouter.createCaller({ user });

describeIntegration("alice satisfaction rating (A1-014)", () => {
  let member: Row;
  let outsider: Row;
  let alice: Row;
  let conversation: number;
  let aliceMessage: number;
  let humanMessage: number;
  const previous = process.env.ALICE_USER_ID;

  beforeAll(async () => {
    await resetDatabase();
    member = await createUser({ name: "Member" });
    outsider = await createUser({ name: "Outsider" });
    alice = await createUser({ name: "Alice" });
    process.env.ALICE_USER_ID = String(alice.id);
    conversation = await createConversation([member.id, alice.id]);
    aliceMessage = await createMessage(conversation, alice.id, "Here is a reply.");
    humanMessage = await createMessage(conversation, member.id, "Thanks.");
  });

  afterAll(async () => {
    if (previous == null) delete process.env.ALICE_USER_ID;
    else process.env.ALICE_USER_ID = previous;
    await resetDatabase();
  });

  it("stores a thumb, replaces it, and clears on the same thumb", async () => {
    const api = caller(member);
    expect(await api.message.rateAlice({ messageId: aliceMessage, rating: "up" })).toEqual({
      messageId: aliceMessage,
      rating: "up",
    });
    expect(await api.message.rateAlice({ messageId: aliceMessage, rating: "down" })).toEqual({
      messageId: aliceMessage,
      rating: "down",
    });
    const listed = await api.message.listByConversation({ conversationId: conversation, limit: 20 });
    const row = listed.find((message) => message.id === aliceMessage);
    expect(row?.aliceRating).toBe("down");
    expect(listed.find((message) => message.id === humanMessage)?.aliceRating).toBeNull();
    expect(await api.message.rateAlice({ messageId: aliceMessage, rating: "down" })).toEqual({
      messageId: aliceMessage,
      rating: null,
    });
    const remaining = await getDb()
      .select()
      .from(aliceMessageRatings)
      .where(eq(aliceMessageRatings.messageId, aliceMessage));
    expect(remaining).toHaveLength(0);
  });

  it("refuses a human message and a non-member", async () => {
    await expect(
      caller(member).message.rateAlice({ messageId: humanMessage, rating: "up" }),
    ).rejects.toThrow(/Only Alice messages/);
    await expect(
      caller(outsider).message.rateAlice({ messageId: aliceMessage, rating: "up" }),
    ).rejects.toThrow();
  });
});
