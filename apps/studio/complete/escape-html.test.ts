import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const file = path.resolve("apps/studio/complete/app.js");

function expectedEscapedSample(): string {
  // Pieces are raw characters, not HTML entities, so a transport that
  // decodes entities cannot rewrite this assertion.
  const amp = "\u0026";
  return [
    amp, "lt;a href=",
    amp, "quot;x",
    amp, "quot;",
    amp, "gt;",
    amp, "amp;",
    amp, "#39;",
  ].join("");
}

describe("studio complete esc()", () => {
  it("parses as JavaScript", () => {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  });

  it("escapes the five HTML specials and treats null as empty", () => {
    const src = readFileSync(file, "utf8");
    const match = src.match(/function esc\(s\) \{[\s\S]*?\n\}/);
    expect(match, "esc() must stay a top-level function in app.js").not.toBeNull();
    const esc = vm.runInNewContext(`${match![0]}\nesc`) as (value: unknown) => string;
    const sample = "<a href=\"x\">&'";
    expect(esc(sample)).toBe(expectedEscapedSample());
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });
});
