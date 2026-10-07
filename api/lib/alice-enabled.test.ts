import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planAliceKillSwitch, readAliceEnabled } from "./alice-enabled";

describe("ALICE_ENABLED kill switch", () => {
  it("stays on unless the env var explicitly disables Alice", () => {
    expect(readAliceEnabled({})).toBe(true);
    expect(readAliceEnabled({ ALICE_ENABLED: "" })).toBe(true);
    expect(readAliceEnabled({ ALICE_ENABLED: "true" })).toBe(true);
    expect(readAliceEnabled({ ALICE_ENABLED: "false" })).toBe(false);
    expect(readAliceEnabled({ ALICE_ENABLED: "0" })).toBe(false);
    expect(readAliceEnabled({ ALICE_ENABLED: "off" })).toBe(false);
    expect(readAliceEnabled({ ALICE_ENABLED: "no" })).toBe(false);
    expect(planAliceKillSwitch(true)).toBe("invoke");
    expect(planAliceKillSwitch(false)).toBe("skip");
  });

  it("gates provider replies and re-invites without a database flag", () => {
    const reply = readFileSync("api/lib/alice-reply.ts", "utf8");
    const admit = readFileSync("api/lib/alice-admission.ts", "utf8");
    const participant = readFileSync("api/lib/alice-participant.ts", "utf8");
    const enabled = readFileSync("api/lib/alice-enabled.ts", "utf8");
    const replyBody = reply.slice(reply.indexOf("export async function deliverAliceReply"));
    const admitBody = admit.slice(admit.indexOf("export async function replyAfterAliceAdmit"));
    const reinvite = participant.slice(participant.indexOf("export async function reinviteAlice"));
    expect(replyBody.indexOf("planAliceKillSwitch")).toBeGreaterThan(-1);
    expect(replyBody.indexOf("planAliceKillSwitch")).toBeLessThan(replyBody.indexOf("requestAliceCompletion"));
    expect(replyBody).toContain('return "disabled"');
    const skip = replyBody.slice(replyBody.indexOf("planAliceKillSwitch"), replyBody.indexOf('return "disabled"'));
    expect(skip).not.toContain("storeAliceNote");
    expect(skip).not.toContain("requestAliceCompletion");
    expect(admitBody.indexOf("planAliceKillSwitch")).toBeLessThan(admitBody.indexOf("deliverAliceReply"));
    expect(admitBody).toContain('return "disabled"');
    expect(reinvite.indexOf("planAliceKillSwitch")).toBeLessThan(reinvite.indexOf("aliceDeclines"));
    expect(reinvite).toContain("Alice is disabled on this instance");
    expect(enabled).toContain("feature_flags");
    expect(enabled).not.toContain("CREATE TABLE");
  });
});
