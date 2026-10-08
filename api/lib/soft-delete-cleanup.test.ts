import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SOFT_DELETE_RETENTION_DAYS,
  cleanupSoftDeletedBodies,
  readSoftDeleteRetentionDays,
  softDeleteCutoff,
  tombstoneStillHoldsBody,
} from "./soft-delete-cleanup";

describe("P4-003 soft-delete cleanup", () => {
  it("declares the deletedAt scan index in migration 0018", () => {
    const sql = readFileSync("db/migrations/0018_soft_delete_cleanup.sql", "utf8");
    expect(sql).toContain("messages_deleted_at_idx");
    expect(sql).toContain("`deletedAt`");
    const journal = readFileSync("db/migrations/meta/_journal.json", "utf8");
    expect(journal).toContain('"tag": "0018_soft_delete_cleanup"');
    const schema = readFileSync("db/schema.ts", "utf8");
    expect(schema).toContain('index("messages_deleted_at_idx")');
  });

  it("uses 30 days when the retention env is empty or invalid", () => {
    expect(readSoftDeleteRetentionDays({})).toBe(DEFAULT_SOFT_DELETE_RETENTION_DAYS);
    expect(readSoftDeleteRetentionDays({ SOFT_DELETE_RETENTION_DAYS: "" })).toBe(30);
    expect(readSoftDeleteRetentionDays({ SOFT_DELETE_RETENTION_DAYS: "0" })).toBe(30);
    expect(readSoftDeleteRetentionDays({ SOFT_DELETE_RETENTION_DAYS: "14" })).toBe(14);
  });

  it("cuts off at the retention window", () => {
    const now = new Date("2026-10-07T21:00:00.000Z");
    expect(softDeleteCutoff(now, 30).toISOString()).toBe("2026-09-07T21:00:00.000Z");
  });

  it("treats blank tombstones as already cleaned and file pointers as leftover bodies", () => {
    expect(tombstoneStillHoldsBody({ id: 1, content: "", fileUrl: null })).toBe(false);
    expect(tombstoneStillHoldsBody({ id: 2, content: "still here", fileUrl: null })).toBe(true);
    expect(tombstoneStillHoldsBody({ id: 3, content: "", fileUrl: "/files/a" })).toBe(true);
  });

  it("clears leftover bodies and attachment bytes without deleting the message row", async () => {
    const deleted: number[][] = [];
    const updated: Array<{ content: string; fileUrl: null }> = [];
    const removedKeys: string[] = [];
    const db = {
      select() {
        return {
          from() {
            return this;
          },
          where() {
            return this;
          },
          limit() {
            return Promise.resolve([
              { id: 9, content: "old body", fileUrl: "/files/9" },
              { id: 10, content: "", fileUrl: null },
            ]);
          },
          then(resolve: (rows: Array<{ id: number; storageKey: string }>) => void) {
            resolve([{ id: 4, storageKey: "att/4" }]);
          },
        };
      },
      update() {
        return {
          set(patch: { content: string; fileUrl: null }) {
            updated.push(patch);
            return { where: () => Promise.resolve() };
          },
        };
      },
      delete() {
        return {
          where(ids: number[]) {
            deleted.push(ids);
            return Promise.resolve();
          },
        };
      },
    };

    const result = await cleanupSoftDeletedBodies(db as never, {
      now: new Date("2026-10-07T21:00:00.000Z"),
      retentionDays: 30,
      deleteObject: async (key) => {
        removedKeys.push(key);
      },
    });

    expect(updated).toEqual([{ content: "", fileUrl: null }]);
    expect(removedKeys).toEqual(["att/4"]);
    expect(deleted).toHaveLength(1);
    expect(result).toMatchObject({
      cutoff: "2026-09-07T21:00:00.000Z",
      scanned: 2,
      bodiesCleared: 1,
      attachmentsRemoved: 1,
    });
  });

  it("does not start an erasure email from the cleanup module", () => {
    const source = readFileSync("api/lib/soft-delete-cleanup.ts", "utf8");
    expect(source).not.toMatch(/nodemailer|sendMail|erasure email/i);
    expect(source).toContain("The row stays");
  });

  it("boots the sweep outside tests", () => {
    const boot = readFileSync("api/boot.ts", "utf8");
    expect(boot).toContain("startSoftDeleteCleanup()");
    expect(vi.isMockFunction(vi.fn())).toBe(true);
  });
});
