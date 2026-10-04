import { describe, expect, it } from "vitest";
import { flattenMessagePages, nextOlderCursor } from "./message-pagination";

describe("nextOlderCursor", () => {
  it("does not paginate a short first page", () => {
    expect(nextOlderCursor([{ id: 3 }, { id: 4 }], 50)).toBeUndefined();
  });

  it("uses the oldest id on a full page, exclusive of that id", () => {
    expect(nextOlderCursor([{ id: 12 }, { id: 40 }, { id: 41 }], 3)).toBe(12);
  });

  it("returns undefined for an empty older page", () => {
    expect(nextOlderCursor([], 50)).toBeUndefined();
  });
});

describe("flattenMessagePages", () => {
  it("renders older pages before the latest page without mutating the query pages", () => {
    const pages = [[{ id: 3 }, { id: 4 }], [{ id: 1 }, { id: 2 }]];
    expect(flattenMessagePages(pages).map((row) => row.id)).toEqual([1, 2, 3, 4]);
    expect(pages[0].map((row) => row.id)).toEqual([3, 4]);
  });
});
