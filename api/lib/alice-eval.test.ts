/**
 * A1-013. 20 conversation fixtures, no live provider (MASTER §7.11).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { assertAliceFixture, scoreAliceFixture, type AliceEvalFixture } from "./alice-eval";

const fixtureDir = path.resolve(process.cwd(), "tests/alice/fixtures");

function loadFixtures(): AliceEvalFixture[] {
  return readdirSync(fixtureDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(path.join(fixtureDir, name), "utf8")) as AliceEvalFixture);
}

describe("alice eval suite", () => {
  const fixtures = loadFixtures();

  it("ships the §7.11 set of 20 fixtures, including the five §7.8 injection cases", () => {
    expect(fixtures).toHaveLength(20);
    expect(fixtures.map((fixture) => fixture.index)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(fixtures.filter((fixture) => fixture.category === "factual")).toHaveLength(5);
    expect(fixtures.filter((fixture) => fixture.category === "code")).toHaveLength(3);
    expect(fixtures.filter((fixture) => fixture.category === "harmful")).toHaveLength(3);
    expect(fixtures.filter((fixture) => fixture.category === "injection")).toHaveLength(5);
    expect(fixtures.some((fixture) => fixture.category === "cost_cap")).toBe(true);
    expect(fixtures.some((fixture) => fixture.category === "cjk")).toBe(true);
    expect(fixtures.some((fixture) => fixture.category === "lifecycle")).toBe(true);
    expect(fixtures.some((fixture) => fixture.category === "long_context")).toBe(true);
  });

  it("scores every fixture offline and never calls fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("provider must not be called"));
    const previous = process.env.ALICE_API_KEY;
    delete process.env.ALICE_API_KEY;
    try {
      for (const fixture of fixtures) {
        const result = scoreAliceFixture(fixture);
        assertAliceFixture(fixture, result);
        expect(result.providerCalled).toBe(false);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      if (previous == null) delete process.env.ALICE_API_KEY;
      else process.env.ALICE_API_KEY = previous;
    }
  });
});
