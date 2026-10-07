import path from "node:path";
import { describe, expect, it } from "vitest";
import { gradeAliceEvalFixture, loadAliceEvalFixtures } from "../../api/lib/alice-eval";

const fixtures = loadAliceEvalFixtures(path.join(__dirname, "fixtures"));

describe("A1-013 Alice eval suite", () => {
  it("loads the §7.11 set of 20 fixtures", () => {
    expect(fixtures).toHaveLength(20);
    expect(fixtures.map((fixture) => fixture.n)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it.each(fixtures.map((fixture) => [fixture.id, fixture] as const))("%s passes the local contract", (_id, fixture) => {
    const grade = gradeAliceEvalFixture(fixture);
    expect(grade.failures).toEqual([]);
    expect(grade.pass).toBe(true);
  });
});
