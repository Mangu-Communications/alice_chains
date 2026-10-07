import { describe, expect, it } from "vitest";
import { ALICE_DELETED_CONTENT, assembleAliceContext } from "./alice-context";

const joinedAt = new Date("2026-10-07T12:00:00.000Z");

function row(
  id: number,
  createdAt: string,
  content: string,
  deletedAt: string | null = null,
) {
  return { id, senderId: 4, content, createdAt, deletedAt };
}

describe("alice context assembly", () => {
  it("keeps the last N messages since joinedAt, oldest first", () => {
    const window = assembleAliceContext(
      [
        row(1, "2026-10-07T11:59:59.000Z", "before join"),
        row(2, "2026-10-07T12:00:00.000Z", "at join"),
        row(3, "2026-10-07T12:01:00.000Z", "second"),
        row(4, "2026-10-07T12:02:00.000Z", "third"),
      ],
      { joinedAt, limit: 2 },
    );
    expect(window.map((message) => message.id)).toEqual([3, 4]);
    expect(window.map((message) => message.content)).toEqual(["second", "third"]);
    expect(window.every((message) => message.tombstone === false)).toBe(true);
  });

  it("excludes messages deleted before join and redacts tombstones after join", () => {
    const window = assembleAliceContext(
      [
        row(1, "2026-10-07T11:00:00.000Z", "secret before join", "2026-10-07T11:30:00.000Z"),
        row(2, "2026-10-07T12:05:00.000Z", "still stored but deleted", "2026-10-07T12:06:00.000Z"),
        row(3, "2026-10-07T12:07:00.000Z", "@alice what changed?"),
      ],
      { joinedAt, limit: 50 },
    );
    expect(window).toHaveLength(2);
    expect(window[0]).toMatchObject({
      id: 2,
      content: ALICE_DELETED_CONTENT,
      tombstone: true,
    });
    expect(JSON.stringify(window)).not.toContain("still stored but deleted");
    expect(JSON.stringify(window)).not.toContain("secret before join");
    expect(window[1]?.content).toBe("@alice what changed?");
  });
});
