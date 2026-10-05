/**
 * P-CALL-4. HMAC time-limited TURN credentials (MASTER.md §14.3, coturn use-auth-secret).
 *
 * The shared secret never leaves the server. A missing secret or URL list is
 * not an error: calls fall back to STUN. Do not invent a secret here.
 */
import { createHmac } from "node:crypto";
import { env } from "./env";

export const DEFAULT_TURN_TTL_SECONDS = 86_400;
export const PUBLIC_STUN_URL = "stun:stun.l.google.com:19302";

export type TurnCredentials = {
  username: string;
  credential: string;
  ttl: number;
};

export type IceServer = {
  urls: string[];
  username?: string;
  credential?: string;
};

export type TurnConfig = {
  secret?: string;
  urls?: string;
};

export function generateTurnCredentials(
  secret: string,
  ttlSeconds = DEFAULT_TURN_TTL_SECONDS,
  nowMs = Date.now()
): TurnCredentials {
  if (!secret) {
    throw new Error("TURN_SECRET is not set");
  }
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("ttlSeconds must be a positive number");
  }
  const username = `${Math.floor(nowMs / 1000) + Math.floor(ttlSeconds)}`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { username, credential, ttl: Math.floor(ttlSeconds) };
}

/** Accept only turn: and turns: URLs. Blank and other schemes are dropped. */
export function parseTurnUrls(raw: string | undefined): string[] {
  if (!raw) return [];
  const urls: string[] = [];
  for (const part of raw.split(",")) {
    const url = part.trim();
    if (!url) continue;
    if (url.startsWith("turn:") || url.startsWith("turns:")) urls.push(url);
  }
  return urls;
}

export function turnIsConfigured(config: TurnConfig = envTurnConfig()): boolean {
  return Boolean(config.secret) && parseTurnUrls(config.urls).length > 0;
}

function envTurnConfig(): TurnConfig {
  return { secret: env.TURN_SECRET, urls: env.TURN_URLS };
}

/**
 * ICE servers for the next call invitation. STUN is always included.
 * TURN is included only when the operator set both secret and URLs.
 */
export function callIceServers(
  nowMs = Date.now(),
  config: TurnConfig = envTurnConfig()
): {
  turnConfigured: boolean;
  iceServers: IceServer[];
} {
  const iceServers: IceServer[] = [{ urls: [PUBLIC_STUN_URL] }];
  const urls = parseTurnUrls(config.urls);
  if (!config.secret || urls.length === 0) {
    return { turnConfigured: false, iceServers };
  }
  const creds = generateTurnCredentials(config.secret, DEFAULT_TURN_TTL_SECONDS, nowMs);
  iceServers.push({
    urls,
    username: creds.username,
    credential: creds.credential,
  });
  return { turnConfigured: true, iceServers };
}
