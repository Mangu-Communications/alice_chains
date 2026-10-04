import { describe, expect, it } from "vitest";
import { firstPreviewUrl } from "./link-preview";

describe("firstPreviewUrl", () => {
  it("returns the first safe href and ignores javascript", () => {
    expect(firstPreviewUrl("see https://example.com/a and http://other.test")).toBe(
      "https://example.com/a"
    );
    expect(firstPreviewUrl("javascript:alert(1)")).toBeNull();
    expect(firstPreviewUrl("no link here")).toBeNull();
  });
});
