/**
 * P-LINK-1 — card under the first link in a message.
 * Query result is cached on the server for an hour; the client matches that.
 */
import { trpc } from "@/providers/trpc";
import { firstPreviewUrl } from "@/lib/link-preview";
import { PREVIEW_TTL_MS } from "@/lib/link-preview-ttl";

export function MessageLinkPreview({ content }: { content: string }) {
  const url = firstPreviewUrl(content);
  if (!url) return null;
  return <LinkPreviewCard url={url} />;
}

export function LinkPreviewCard({ url }: { url: string }) {
  const { data } = trpc.link.preview.useQuery(
    { url },
    { staleTime: PREVIEW_TTL_MS, retry: false }
  );
  if (!data?.title && !data?.description) return null;
  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="mt-2 flex max-w-sm gap-2 overflow-hidden rounded-md border border-border bg-background/60 p-2 text-left no-underline hover:bg-background"
    >
      {data.imageUrl ? (
        <img
          src={data.imageUrl}
          alt=""
          className="h-14 w-14 shrink-0 rounded object-cover"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <span className="min-w-0">
        {data.siteName ? (
          <span className="block text-[10px] uppercase tracking-wide opacity-60">{data.siteName}</span>
        ) : null}
        {data.title ? <span className="block truncate text-sm font-medium">{data.title}</span> : null}
        {data.description ? (
          <span className="block line-clamp-2 text-xs opacity-70">{data.description}</span>
        ) : null}
      </span>
    </a>
  );
}
