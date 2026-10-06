/**
 * P-A11Y-2. What a screen reader should hear when a message arrives in the
 * open conversation. Own echoes are silent: the composer already confirmed
 * the send. History already on screen is not announced; the caller seeds the
 * latest id and only asks for rows appended after that.
 */
import { t } from "@/i18n";

const EXCERPT_MAX = 120;

export function clipAnnouncement(content: string | null | undefined, max = EXCERPT_MAX): string {
  const flat = (content ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

export function incomingMessageAnnouncement(input: {
  senderId: number;
  selfId: number | undefined;
  senderName: string | null | undefined;
  content: string | null | undefined;
  attachmentCount?: number;
}): string | null {
  if (input.selfId !== undefined && input.senderId === input.selfId) return null;
  const name = input.senderName?.trim() || "someone";
  const excerpt = clipAnnouncement(input.content);
  if (excerpt) return t("live.newMessageBody", name, excerpt);
  if ((input.attachmentCount ?? 0) > 0) return t("live.newAttachmentFrom", name);
  return t("live.newMessageFrom", name);
}
