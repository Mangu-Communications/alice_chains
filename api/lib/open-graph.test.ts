/**
 * P-LINK-1 — Open Graph parse, SSRF refusal, and the one-hour cache.
 */
import { describe, expect, it, vi } from "vitest";
import {
  PREVIEW_TTL_MS,
  assertPreviewUrl,
  fetchLinkPreview,
  isBlockedAddress,
  parseOpenGraph,
  previewCacheSize,
  resetPreviewCache,
} from "./open-graph";

const HTML = `<!doctype html><html><head>
<meta property="og:site_name" content="Example">
<meta content="A & B" property="og:title">
<meta name="description" content="Plain fallback">
<meta property="og:description" content="Graph text">
<meta property="og:image" content="https://cdn.example/pic.png">
<title>Ignored</title>
</head></html>`;

describe("parseOpenGraph", () => {
  it("reads Open Graph fields and decodes entities", () => {
    expect(parseOpenGraph(HTML)).toEqual({
      title: "A & B",
      description: "Graph text",
      siteName: "Example",
      imageUrl: "https://cdn.example/pic.png",
    });
  });

  it("falls back to the title tag", () => {
    expect(parseOpenGraph("<title>Hello &#39;there&#39;</title>").title).toBe("Hello 'there'");
  });
});

describe("assertPreviewUrl", () => {
  it("allows public http and https on 80 and 443", () => {
    expect(assertPreviewUrl("https://example.com/a").hostname).toBe("example.com");
    expect(assertPreviewUrl("http://example.com").protocol).toBe("http:");
  });

  it("refuses non-http schemes, userinfo, odd ports, and private hosts", () => {
    expect(() => assertPreviewUrl("javascript:alert(1)")).toThrow();
    expect(() => assertPreviewUrl("file:///etc/passwd")).toThrow();
    expect(() => assertPreviewUrl("https://user:pass@example.com")).toThrow();
    expect(() => assertPreviewUrl("https://example.com:8080")).toThrow();
    expect(() => assertPreviewUrl("http://127.0.0.1")).toThrow();
    expect(() => assertPreviewUrl("http://169.254.169.254/latest")).toThrow();
    expect(() => assertPreviewUrl("http://localhost")).toThrow();
    expect(() => assertPreviewUrl("http://metadata.google.internal")).toThrow();
  });
});

describe("isBlockedAddress", () => {
  it("blocks private, loopback, and link-local ranges", () => {
    expect(isBlockedAddress("10.1.2.3")).toBe(true);
    expect(isBlockedAddress("192.168.1.1")).toBe(true);
    expect(isBlockedAddress("172.16.0.1")).toBe(true);
    expect(isBlockedAddress("127.0.0.1")).toBe(true);
    expect(isBlockedAddress("169.254.169.254")).toBe(true);
    expect(isBlockedAddress("::1")).toBe(true);
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
  });
});

describe("fetchLinkPreview", () => {
  it("fetches once and serves the cache for an hour", async () => {
    resetPreviewCache();
    const fetchImpl = vi.fn(async () => new Response(HTML, { headers: { "content-type": "text/html" } }));
    const lookup = vi.fn(async () => ["93.184.216.34"]);
    let now = 1_000;
    const first = await fetchLinkPreview("https://example.com/page", {
      fetch: fetchImpl as typeof fetch,
      lookup,
      now: () => now,
    });
    expect(first?.title).toBe("A & B");
    expect(first?.imageUrl).toBe("https://cdn.example/pic.png");
    now += PREVIEW_TTL_MS - 1;
    const second = await fetchLinkPreview("https://example.com/page", {
      fetch: fetchImpl as typeof fetch,
      lookup,
      now: () => now,
    });
    expect(second?.title).toBe("A & B");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(previewCacheSize()).toBe(1);
  });

  it("refetches after the hour", async () => {
    resetPreviewCache();
    const fetchImpl = vi.fn(async () => new Response(HTML, { headers: { "content-type": "text/html" } }));
    let now = 1_000;
    await fetchLinkPreview("https://example.com/later", {
      fetch: fetchImpl as typeof fetch,
      lookup: async () => ["93.184.216.34"],
      now: () => now,
    });
    now += PREVIEW_TTL_MS + 1;
    await fetchLinkPreview("https://example.com/later", {
      fetch: fetchImpl as typeof fetch,
      lookup: async () => ["93.184.216.34"],
      now: () => now,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not follow a redirect onto a private address", async () => {
    resetPreviewCache();
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } }));
    const preview = await fetchLinkPreview("https://example.com/bounce", {
      fetch: fetchImpl as typeof fetch,
      lookup: async () => ["93.184.216.34"],
      now: () => 5,
    });
    expect(preview).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses a public name that resolves to a private address", async () => {
    resetPreviewCache();
    const fetchImpl = vi.fn();
    const preview = await fetchLinkPreview("https://example.com/rebind", {
      fetch: fetchImpl as typeof fetch,
      lookup: async () => ["10.0.0.5"],
      now: () => 5,
    });
    expect(preview).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
