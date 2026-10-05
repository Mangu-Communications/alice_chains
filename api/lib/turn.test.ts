/**
 * P-CALL-4 — coturn HMAC credentials. The secret is an argument, never a fixture secret shipped as production.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  callIceServers,
  generateTurnCredentials,
  parseTurnUrls,
  turnIsConfigured,
} from "./turn";

const NOW = 1_700_000_000_000;
const SECRET = "unit-test-turn-secret";

describe("generateTurnCredentials", () => {
  it("uses the expiry timestamp as the username and HMAC-SHA1 as the credential", () => {
    const ttl = 86_400;
    const issued = generateTurnCredentials(SECRET, ttl, NOW);
    const username = `${Math.floor(NOW / 1000) + ttl}`;
    expect(issued.username).toBe(username);
    expect(issued.ttl).toBe(ttl);
    expect(issued.credential).toBe(createHmac("sha1", SECRET).update(username).digest("base64"));
    expect(issued.credential).not.toBe(SECRET);
  });

  it("refuses to invent a credential when the secret is missing", () => {
    expect(() => generateTurnCredentials("")).toThrow(/TURN_SECRET/);
  });

  it("rejects a non-positive ttl", () => {
    expect(() => generateTurnCredentials(SECRET, 0, NOW)).toThrow(/ttlSeconds/);
  });
});

describe("parseTurnUrls", () => {
  it("keeps turn and turns urls and drops anything else", () => {
    expect(
      parseTurnUrls(
        " turn:turn.example.com:3478, https://evil.example, turns:turn.example.com:5349 "
      )
    ).toEqual(["turn:turn.example.com:3478", "turns:turn.example.com:5349"]);
    expect(parseTurnUrls(undefined)).toEqual([]);
    expect(parseTurnUrls(" , ")).toEqual([]);
  });
});

describe("callIceServers", () => {
  it("returns STUN only when the operator has not configured TURN", () => {
    const issued = callIceServers(NOW, {});
    expect(issued.turnConfigured).toBe(false);
    expect(turnIsConfigured({})).toBe(false);
    expect(issued.iceServers).toEqual([{ urls: ["stun:stun.l.google.com:19302"] }]);
  });

  it("issues a short-lived TURN entry without the shared secret", () => {
    const config = { secret: SECRET, urls: "turn:turn.example.com:3478" };
    expect(turnIsConfigured(config)).toBe(true);
    const issued = callIceServers(NOW, config);
    expect(issued.turnConfigured).toBe(true);
    expect(issued.iceServers[1]).toEqual({
      urls: ["turn:turn.example.com:3478"],
      username: `${Math.floor(NOW / 1000) + 86_400}`,
      credential: createHmac("sha1", SECRET)
        .update(`${Math.floor(NOW / 1000) + 86_400}`)
        .digest("base64"),
    });
    expect(JSON.stringify(issued.iceServers)).not.toContain(SECRET);
  });

  it("does not issue TURN when only one of secret and urls is set", () => {
    expect(turnIsConfigured({ secret: SECRET })).toBe(false);
    expect(callIceServers(NOW, { secret: SECRET }).turnConfigured).toBe(false);
    expect(callIceServers(NOW, { urls: "turn:turn.example.com:3478" }).turnConfigured).toBe(false);
  });
});
