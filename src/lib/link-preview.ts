/**
 * P-LINK-1 — first safe http(s) URL in a message, for the preview card.
 * Parsing stays in linkify so the card cannot invent a href Linkify rejected.
 */
import { splitLinks } from "@/lib/linkify";

export function firstPreviewUrl(text: string): string | null {
  const link = splitLinks(text).find((part) => part.type === "link" && part.href);
  return link?.href ?? null;
}
