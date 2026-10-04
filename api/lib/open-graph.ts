/**
 * P-LINK-1 — server-side Open Graph fetch with a one-hour cache.
 *
 * BUILD_PLAN's older P-LINK-1 stopped at safe anchors because an unbounded
 * fetch is SSRF. MASTER.md Wave 4 asks for the preview anyway, so this module
 * fetches only after the target is a public http(s) URL, follows redirects
 * only when each hop passes the same check, and caches the result for an hour.
 * Storage is in-process, same limitation as the rate limiter: one replica.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export const PREVIEW_TTL_MS = 60 * 60 * 1000;
export const PREVIEW_MAX_BYTES = 256 * 1024;
export const PREVIEW_TIMEOUT_MS = 4_000;
export const PREVIEW_MAX_REDIRECTS = 3;

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 300;
const SITE_MAX = 80;

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageUrl: string | null;
}

interface CacheEntry {
  expiresAt: number;
  preview: LinkPreview | null;
}

const cache = new Map<string, CacheEntry>();

export function resetPreviewCache(): void {
  cache.clear();
}

export function previewCacheSize(): number {
  return cache.size;
}

/** Public for tests. True for loopback, private, link-local, and unspecified. */
export function isBlockedAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (ip === "::1" || ip === "::" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) {
    return true;
  }
  const mapped = ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
  const parts = mapped.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return ip.includes(":") ? false : true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 255) return true;
  return false;
}

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata.internal"]);

export function assertPreviewUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("invalid url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("scheme");
  if (url.username || url.password) throw new Error("userinfo");
  const port = url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);
  if (port !== 80 && port !== 443) throw new Error("port");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("host");
  }
  if (isIP(host) && isBlockedAddress(host)) throw new Error("address");
  url.hash = "";
  url.hostname = host;
  return url;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCode(Number.parseInt(dec, 10)))
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/&/g, "&");
}

function safeCode(code: number): string {
  if (!Number.isFinite(code) || code < 32 || code === 127 || code > 0x10ffff) return "";
  return String.fromCodePoint(code);
}

function clip(value: string | null, max: number): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function metaContent(html: string, key: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const attr = (name: string) => {
      const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
      return match ? (match[2] ?? match[3] ?? "") : null;
    };
    const property = (attr("property") ?? attr("name") ?? "").toLowerCase();
    if (property !== key) continue;
    const content = attr("content");
    if (content !== null) return decodeEntities(content);
  }
  return null;
}

/** Pull title, description, site name, and image from an HTML document. */
export function parseOpenGraph(html: string): Omit<LinkPreview, "url"> {
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = clip(metaContent(html, "og:title") ?? (titleTag ? decodeEntities(titleTag[1]) : null), TITLE_MAX);
  const description = clip(
    metaContent(html, "og:description") ?? metaContent(html, "description"),
    DESCRIPTION_MAX
  );
  const siteName = clip(metaContent(html, "og:site_name"), SITE_MAX);
  const image = metaContent(html, "og:image");
  return { title, description, siteName, imageUrl: image };
}

export type AddressLookup = (hostname: string) => Promise<string[]>;

async function defaultLookup(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

async function assertPublicHost(hostname: string, lookup: AddressLookup): Promise<void> {
  const addresses = await lookup(hostname);
  if (addresses.length === 0) throw new Error("dns");
  if (addresses.some((address) => isBlockedAddress(address))) throw new Error("address");
}

function resolveRedirect(current: URL, location: string): URL {
  return assertPreviewUrl(new URL(location, current).toString());
}

export interface FetchPreviewDeps {
  fetch?: typeof fetch;
  lookup?: AddressLookup;
  now?: () => number;
}

/**
 * Return a cached preview, or fetch one. Null means no usable title or
 * description (still cached, so a dead URL is not fetched again for an hour).
 */
export async function fetchLinkPreview(raw: string, deps: FetchPreviewDeps = {}): Promise<LinkPreview | null> {
  const now = deps.now ?? Date.now;
  let target: URL;
  try {
    target = assertPreviewUrl(raw);
  } catch {
    return null;
  }
  const key = target.toString();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now()) return hit.preview;

  let preview: LinkPreview | null = null;
  try {
    preview = await loadPreview(target, deps.fetch ?? fetch, deps.lookup ?? defaultLookup);
  } catch {
    preview = null;
  }
  cache.set(key, { expiresAt: now() + PREVIEW_TTL_MS, preview });
  return preview;
}

async function loadPreview(start: URL, doFetch: typeof fetch, lookup: AddressLookup): Promise<LinkPreview | null> {
  let current = start;
  for (let hop = 0; hop <= PREVIEW_MAX_REDIRECTS; hop += 1) {
    await assertPublicHost(current.hostname, lookup);
    const response = await doFetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "AlisonsLinkPreview/1.0",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      current = resolveRedirect(current, location);
      continue;
    }
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) return null;
    const html = await readLimited(response);
    const parsed = parseOpenGraph(html);
    if (!parsed.title && !parsed.description) return null;
    let imageUrl: string | null = null;
    if (parsed.imageUrl) {
      try {
        const image = assertPreviewUrl(new URL(parsed.imageUrl, current).toString());
        await assertPublicHost(image.hostname, lookup);
        imageUrl = image.toString();
      } catch {
        imageUrl = null;
      }
    }
    return { url: current.toString(), ...parsed, imageUrl };
  }
  return null;
}

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return (await response.text()).slice(0, PREVIEW_MAX_BYTES);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < PREVIEW_MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = PREVIEW_MAX_BYTES - total;
    chunks.push(value.byteLength > room ? value.slice(0, room) : value);
    total += Math.min(value.byteLength, room);
    if (value.byteLength > room) break;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}
