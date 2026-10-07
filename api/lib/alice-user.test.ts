import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALICE_SYSTEM_ROLE,
  ALICE_SYSTEM_STATUS,
  ALICE_SYSTEM_UNION_ID,
  ALICE_SYSTEM_USER_INSERT,
  readAliceUserId,
} from "./alice-user";

describe("A1-002 Alice system user", () => {
  it("matches §7.5 and is idempotent on unique unionId", () => {
    const sql = readFileSync("db/migrations/0013_alice_system_user.sql", "utf8");
    expect(sql).toContain(ALICE_SYSTEM_USER_INSERT);
    expect(sql).toContain("INSERT IGNORE INTO users (unionId, name, role, status)");
    expect(sql).toContain(
      `VALUES ('${ALICE_SYSTEM_UNION_ID}', 'Alice', '${ALICE_SYSTEM_ROLE}', '${ALICE_SYSTEM_STATUS}');`,
    );
    expect(sql).not.toMatch(/INSERT INTO users/i);
    expect(ALICE_SYSTEM_STATUS.length).toBeLessThanOrEqual(100);
    const journal = readFileSync("db/migrations/meta/_journal.json", "utf8");
    expect(journal).toContain('"tag": "0013_alice_system_user"');
    expect(journal).toContain('"idx": 13');
  });

  it("does not invent ALICE_USER_ID when the operator has not set it", () => {
    expect(readAliceUserId({})).toBeNull();
    expect(readAliceUserId({ ALICE_USER_ID: "" })).toBeNull();
    expect(readAliceUserId({ ALICE_USER_ID: "alice" })).toBeNull();
    expect(readAliceUserId({ ALICE_USER_ID: "0" })).toBeNull();
    expect(readAliceUserId({ ALICE_USER_ID: "42" })).toBe(42);
  });
});
