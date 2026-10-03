import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Locks the verifier's expected 0002 foreign-key delta to the SQL file.
 * Does not need MySQL. The live probe is `npm run db:verify-migration`.
 */
describe("constraint migration foreign-key delta", () => {
  it("matches the FOREIGN KEY clauses declared in migration 0002", () => {
    const file = readdirSync("db/migrations").find((name) => name.startsWith("0002") && name.endsWith(".sql"));
    expect(file).toBeTruthy();
    const declared = readFileSync(join("db/migrations", file!), "utf8")
      .split("\n")
      .filter((line) => line.includes("FOREIGN KEY")).length;
    const verifier = readFileSync("scripts/verify-constraint-migration.mjs", "utf8");
    const expected = verifier.match(/CONSTRAINT_MIGRATION_FK_DELTA = (\d+)/);
    expect(expected).not.toBeNull();
    expect(Number(expected?.[1])).toBe(declared);
    expect(declared).toBe(10);
  });
});
