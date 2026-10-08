import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Session } from "@contracts/constants";
import {
  absoluteExpiryCutoff,
  idleExpiryCutoff,
  sessionRowIsExpired,
} from "../kimi/session";
import { SESSION_PRUNE_INTERVAL_MS } from "./session-prune";

describe("P4-005 session pruning", () => {
  const now = new Date("2026-10-08T04:00:00.000Z");

  it("declares the prune scan indexes in migration 0019", () => {
    const sql = readFileSync("db/migrations/0019_session_pruning.sql", "utf8");
    expect(sql).toContain("sessions_created_at_idx");
    expect(sql).toContain("sessions_last_seen_at_idx");
    expect(sql).toContain("sessions_revoked_at_idx");
    const journal = readFileSync("db/migrations/meta/_journal.json", "utf8");
    expect(journal).toContain('"tag": "0019_session_pruning"');
    const schema = readFileSync("db/schema.ts", "utf8");
    expect(schema).toContain('index("sessions_created_at_idx")');
    expect(schema).toContain('index("sessions_last_seen_at_idx")');
    expect(schema).toContain('index("sessions_revoked_at_idx")');
  });

  it("cuts absolute expiry at 7 days and idle expiry at 24 hours", () => {
    expect(absoluteExpiryCutoff(now).toISOString()).toBe("2026-10-01T04:00:00.000Z");
    expect(idleExpiryCutoff(now).toISOString()).toBe("2026-10-07T04:00:00.000Z");
    expect(Session.maxAgeSeconds).toBe(60 * 60 * 24 * 7);
    expect(Session.idleMaxAgeSeconds).toBe(60 * 60 * 24);
  });

  it("treats absolute, idle, and revoked rows as expired and keeps a live row", () => {
    const live = {
      createdAt: new Date("2026-10-07T12:00:00.000Z"),
      lastSeenAt: new Date("2026-10-08T03:00:00.000Z"),
      revokedAt: null,
    };
    expect(sessionRowIsExpired(live, now)).toBe(false);
    expect(
      sessionRowIsExpired(
        { ...live, createdAt: new Date("2026-09-30T04:00:00.000Z") },
        now,
      ),
    ).toBe(true);
    expect(
      sessionRowIsExpired(
        { ...live, lastSeenAt: new Date("2026-10-06T04:00:00.000Z") },
        now,
      ),
    ).toBe(true);
    expect(
      sessionRowIsExpired(
        { ...live, revokedAt: new Date("2026-10-08T03:30:00.000Z") },
        now,
      ),
    ).toBe(true);
  });

  it("schedules a daily boot sweep and does not purge accounts", () => {
    const source = readFileSync("api/lib/session-prune.ts", "utf8");
    const boot = readFileSync("api/boot.ts", "utf8");
    expect(SESSION_PRUNE_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
    expect(source).toContain("pruneExpiredSessions");
    expect(source).not.toMatch(/deletionRequestedAt|requestDeletion|purgeAccount/);
    expect(boot).toContain("startSessionPrune()");
    expect(vi.isMockFunction(vi.fn())).toBe(true);
  });
});
