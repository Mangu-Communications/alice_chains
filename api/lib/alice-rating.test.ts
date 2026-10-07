import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nextAliceRating, parseAliceRating } from "./alice-rating";

describe("alice satisfaction rating", () => {
  it("toggles the same thumb off and replaces the other", () => {
    expect(nextAliceRating(null, "up")).toBe("up");
    expect(nextAliceRating("up", "up")).toBeNull();
    expect(nextAliceRating("up", "down")).toBe("down");
    expect(nextAliceRating("down", "down")).toBeNull();
    expect(nextAliceRating(null, "down")).toBe("down");
  });

  it("accepts only up and down", () => {
    expect(parseAliceRating("up")).toBe("up");
    expect(parseAliceRating("down")).toBe("down");
    expect(parseAliceRating("yes")).toBeNull();
    expect(parseAliceRating(1)).toBeNull();
  });

  it("stores one rating per member per message in migration 0016", () => {
    const sql = readFileSync("db/migrations/0016_alice_message_ratings.sql", "utf8");
    expect(sql).toContain("CREATE TABLE `alice_message_ratings`");
    expect(sql).toContain("UNIQUE(`messageId`,`userId`)");
    expect(sql).toContain("enum('up','down')");
    expect(sql).not.toContain("FOREIGN KEY");
    const journal = readFileSync("db/migrations/meta/_journal.json", "utf8");
    expect(journal).toContain('"tag": "0016_alice_message_ratings"');
    expect(journal).toContain('"idx": 16');
  });
});
