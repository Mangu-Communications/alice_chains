/**
 * Deciding who gets a notification for a new message.
 *
 * The rule is: every other member of the conversation who is not currently
 * connected, and who has not turned this conversation down. Someone with the
 * app open already saw it arrive over the socket, and a notification for a
 * message they are looking at is noise.
 */
import { eq } from "drizzle-orm";
import { conversationParticipants, users } from "@db/schema";
import { getDb } from "../../queries/connection";
import { getOnlineUsers } from "../../socket";
import { log } from "../logger";
import { blockedWith } from "../authz";
import { sendToUsers, pushIsConfigured } from "./send";

const PREVIEW_LENGTH = 140;

export interface MessageNotification {
  conversationId: number;
  senderId: number;
  senderName: string | null;
  conversationName: string | null;
  isGroup: boolean;
  content: string;
  hasAttachment: boolean;
}

/**
 * P-UX-1. A mention is `@` plus the member's display name, as a whole token.
 * Names shorter than two characters are ignored so a single letter cannot
 * match every message that happens to contain `@`.
 */
export function mentionsUser(content: string, name: string | null | undefined): boolean {
  const trimmed = name?.trim();
  if (!trimmed || trimmed.length < 2) return false;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)@${escaped}(?=$|[\\s.,!?])`, "i").test(content);
}

export function wantsNotification(
  level: "all" | "mentions" | "off",
  content: string,
  name: string | null | undefined
): boolean {
  if (level === "off") return false;
  if (level === "mentions") return mentionsUser(content, name);
  return true;
}

/**
 * Notify the members who are not watching and who still want this room.
 * Never throws.
 *
 * Delivery failure must not fail the message that triggered it, so every error
 * is swallowed here rather than propagating into the send path.
 */
export async function notifyNewMessage(input: MessageNotification): Promise<void> {
  if (!pushIsConfigured()) return;

  try {
    const [members, blocked] = await Promise.all([
      getDb()
        .select({
          userId: conversationParticipants.userId,
          notifyLevel: conversationParticipants.notifyLevel,
          name: users.name,
        })
        .from(conversationParticipants)
        .leftJoin(users, eq(users.id, conversationParticipants.userId))
        .where(eq(conversationParticipants.conversationId, input.conversationId)),
      blockedWith(input.senderId),
    ]);

    const online = getOnlineUsers();
    const recipients = members
      .filter(
        (member) =>
          member.userId !== input.senderId &&
          !online.has(member.userId) &&
          !blocked.has(member.userId) &&
          wantsNotification(member.notifyLevel, input.content, member.name)
      )
      .map((member) => member.userId);

    if (recipients.length === 0) return;

    const sender = input.senderName || "Someone";
    const preview = input.content.trim();

    await sendToUsers(recipients, {
      // In a group the title names the group and the body names the speaker,
      // because "Bob" alone does not say where to look.
      title: input.isGroup ? input.conversationName || "Group chat" : sender,
      body: input.isGroup
        ? `${sender}: ${bodyFor(preview, input.hasAttachment)}`
        : bodyFor(preview, input.hasAttachment),
      // Deep link, so tapping lands in the conversation rather than the app's
      // front page.
      url: `/chat?c=${input.conversationId}`,
      // One tag per conversation: a burst of messages collapses into the
      // latest instead of stacking.
      tag: `conversation-${input.conversationId}`,
    });
  } catch (error) {
    log.error("push notification failed", { conversationId: input.conversationId, error });
  }
}

function bodyFor(content: string, hasAttachment: boolean): string {
  if (!content) return hasAttachment ? "Sent an attachment" : "Sent a message";
  if (content.length <= PREVIEW_LENGTH) return content;
  return `${content.slice(0, PREVIEW_LENGTH - 1)}…`;
}
