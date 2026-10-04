/**
 * P-LINK-1 — Open Graph preview for a URL a member already pasted.
 *
 * The caller must be signed in. The fetch itself refuses private and
 * link-local targets; this procedure only rate-limits how often a member
 * can ask. A refused or empty preview is null, not an error, so the card hides.
 */
import { z } from "zod";
import { createRouter, rateLimited } from "./middleware";
import { fetchLinkPreview } from "./lib/open-graph";
import { Limits } from "./lib/rate-limit";

export const linkRouter = createRouter({
  preview: rateLimited("link.preview", Limits.linkPreview)
    .input(z.object({ url: z.string().trim().min(1).max(2000) }))
    .query(({ input }) => fetchLinkPreview(input.url)),
});
