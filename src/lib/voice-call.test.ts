import { describe, expect, it } from "vitest";
import {
  applyVoiceCall,
  canStartVoiceCall,
  ICE_RESTART_WINDOW_MS,
  idleVoiceCall,
  mediaConstraints,
  planIceRecovery,
  qualityFromIce,
  type CallOfferEvent,
} from "./voice-call";

const offer = (over: Partial<CallOfferEvent> = {}): CallOfferEvent => ({
  conversationId: 4,
  callId: "c1",
  fromUserId: 8,
  targetUserId: 2,
  sdp: "v=0",
  kind: "audio",
  ...over,
});

describe("applyVoiceCall", () => {
  it("starts an outgoing 1:1 voice call from idle", () => {
    const next = applyVoiceCall(idleVoiceCall(), {
      type: "start",
      callId: "c1",
      conversationId: 4,
      peerUserId: 8,
    });
    expect(next.effect).toEqual({ type: "none" });
    expect(next.state).toMatchObject({
      phase: "outgoing",
      callId: "c1",
      conversationId: 4,
      peerUserId: 8,
      direction: "outgoing",
    });
  });

  it("does not start a second call while one is live", () => {
    const live = applyVoiceCall(idleVoiceCall(), {
      type: "start",
      callId: "c1",
      conversationId: 4,
      peerUserId: 8,
    }).state;
    const next = applyVoiceCall(live, {
      type: "start",
      callId: "c2",
      conversationId: 9,
      peerUserId: 3,
    });
    expect(next.state.callId).toBe("c1");
    expect(next.effect).toEqual({ type: "none" });
  });

  it("rings on an audio offer addressed to self", () => {
    const next = applyVoiceCall(idleVoiceCall(), {
      type: "offer",
      event: offer(),
      selfId: 2,
    });
    expect(next.state).toMatchObject({
      phase: "incoming",
      peerUserId: 8,
      remoteSdp: "v=0",
    });
  });

  it("ignores an offer addressed to someone else", () => {
    const next = applyVoiceCall(idleVoiceCall(), {
      type: "offer",
      event: offer({ targetUserId: 9 }),
      selfId: 2,
    });
    expect(next.state.phase).toBe("idle");
  });

  it("rings on a video offer and keeps kind video", () => {
    const next = applyVoiceCall(idleVoiceCall(), {
      type: "offer",
      event: offer({ kind: "video" }),
      selfId: 2,
    });
    expect(next.effect).toEqual({ type: "none" });
    expect(next.state).toMatchObject({
      phase: "incoming",
      kind: "video",
      peerUserId: 8,
      remoteSdp: "v=0",
    });
  });

  it("stores video on an outgoing start and defaults a bare start to audio", () => {
    const video = applyVoiceCall(idleVoiceCall(), {
      type: "start",
      callId: "c1",
      conversationId: 4,
      peerUserId: 8,
      kind: "video",
    });
    expect(video.state.kind).toBe("video");
    const audio = applyVoiceCall(idleVoiceCall(), {
      type: "start",
      callId: "c2",
      conversationId: 4,
      peerUserId: 8,
    });
    expect(audio.state.kind).toBe("audio");
  });

  it("renegotiates a same-call offer once media is up and still busy-rejects a different call", () => {
    const connected = applyVoiceCall(
      applyVoiceCall(idleVoiceCall(), {
        type: "offer",
        event: offer(),
        selfId: 2,
      }).state,
      { type: "accept" },
    ).state;
    const live = applyVoiceCall(connected, { type: "local-connected" }).state;
    const restart = applyVoiceCall(live, {
      type: "offer",
      event: offer({ sdp: "v=restart" }),
      selfId: 2,
    });
    expect(restart.state.phase).toBe("connected");
    expect(restart.state.remoteSdp).toBe("v=restart");
    expect(restart.effect).toEqual({ type: "renegotiate", sdp: "v=restart" });
    const other = applyVoiceCall(live, {
      type: "offer",
      event: offer({ callId: "theirs" }),
      selfId: 2,
    });
    expect(other.state.callId).toBe("c1");
    expect(other.effect).toMatchObject({ type: "reply-end", reason: "busy", callId: "theirs" });
  });

  it("replies busy when an offer arrives during a live call", () => {
    const live = applyVoiceCall(idleVoiceCall(), {
      type: "start",
      callId: "mine",
      conversationId: 4,
      peerUserId: 8,
    }).state;
    const next = applyVoiceCall(live, {
      type: "offer",
      event: offer({ callId: "theirs" }),
      selfId: 2,
    });
    expect(next.state.callId).toBe("mine");
    expect(next.effect).toMatchObject({ type: "reply-end", reason: "busy", callId: "theirs" });
  });

  it("accepts only an incoming call, then connects", () => {
    const incoming = applyVoiceCall(idleVoiceCall(), {
      type: "offer",
      event: offer(),
      selfId: 2,
    }).state;
    const accepted = applyVoiceCall(incoming, { type: "accept" });
    expect(accepted.state.phase).toBe("connecting");
    const connected = applyVoiceCall(accepted.state, { type: "local-connected" });
    expect(connected.state.phase).toBe("connected");
    expect(applyVoiceCall(idleVoiceCall(), { type: "accept" }).state.phase).toBe("idle");
  });

  it("ends on the matching remote hangup and ignores a different call id", () => {
    const live = applyVoiceCall(idleVoiceCall(), {
      type: "start",
      callId: "c1",
      conversationId: 4,
      peerUserId: 8,
    }).state;
    const other = applyVoiceCall(live, {
      type: "remote-end",
      selfId: 2,
      event: {
        conversationId: 4,
        callId: "other",
        fromUserId: 8,
        targetUserId: 2,
        reason: "hangup",
      },
    });
    expect(other.state.phase).toBe("outgoing");
    const ended = applyVoiceCall(live, {
      type: "remote-end",
      selfId: 2,
      event: {
        conversationId: 4,
        callId: "c1",
        fromUserId: 8,
        targetUserId: 2,
        reason: "decline",
      },
    });
    expect(ended.state).toMatchObject({ phase: "ended", endReason: "decline" });
  });

  it("emits decline when the callee refuses", () => {
    const incoming = applyVoiceCall(idleVoiceCall(), {
      type: "offer",
      event: offer(),
      selfId: 2,
    }).state;
    const next = applyVoiceCall(incoming, { type: "local-end", reason: "decline" });
    expect(next.state.phase).toBe("ended");
    expect(next.effect).toEqual({
      type: "reply-end",
      callId: "c1",
      conversationId: 4,
      targetUserId: 8,
      reason: "decline",
    });
  });

  it("ends an outgoing call when the server says the peer is offline", () => {
    const live = applyVoiceCall(idleVoiceCall(), {
      type: "start",
      callId: "c1",
      conversationId: 4,
      peerUserId: 8,
    }).state;
    const next = applyVoiceCall(live, { type: "offline", callId: "c1" });
    expect(next.state).toMatchObject({ phase: "ended", endReason: "offline" });
    expect(applyVoiceCall(live, { type: "offline", callId: "nope" }).state.phase).toBe("outgoing");
  });
});

describe("canStartVoiceCall", () => {
  it("allows a direct chat with a peer and refuses groups and live calls", () => {
    expect(canStartVoiceCall({ isDirect: true, peerUserId: 8, phase: "idle" })).toBe(true);
    expect(canStartVoiceCall({ isDirect: false, peerUserId: 8, phase: "idle" })).toBe(false);
    expect(canStartVoiceCall({ isDirect: true, peerUserId: null, phase: "idle" })).toBe(false);
    expect(canStartVoiceCall({ isDirect: true, peerUserId: 8, phase: "connected" })).toBe(false);
  });
});

describe("qualityFromIce", () => {
  it("maps ICE states to a quality label", () => {
    expect(qualityFromIce("checking")).toBe("connecting");
    expect(qualityFromIce("connected")).toBe("good");
    expect(qualityFromIce("completed")).toBe("good");
    expect(qualityFromIce("disconnected")).toBe("poor");
    expect(qualityFromIce("failed")).toBe("failed");
  });
});

describe("mediaConstraints", () => {
  it("requests the camera only for a video call", () => {
    expect(mediaConstraints("audio")).toEqual({ audio: true, video: false });
    expect(mediaConstraints("video")).toEqual({ audio: true, video: true });
  });
});

describe("planIceRecovery", () => {
  it("restarts once from the outgoing side inside the 10s window", () => {
    expect(
      planIceRecovery({
        phase: "connected",
        direction: "outgoing",
        iceState: "disconnected",
        dropElapsedMs: 0,
        restartInFlight: false,
      }),
    ).toEqual({ type: "restart" });
    expect(
      planIceRecovery({
        phase: "connected",
        direction: "outgoing",
        iceState: "failed",
        dropElapsedMs: ICE_RESTART_WINDOW_MS - 1,
        restartInFlight: true,
      }),
    ).toEqual({ type: "wait" });
  });

  it("waits on the incoming side and ends after the window", () => {
    expect(
      planIceRecovery({
        phase: "connecting",
        direction: "incoming",
        iceState: "failed",
        dropElapsedMs: 1_000,
        restartInFlight: false,
      }),
    ).toEqual({ type: "wait" });
    expect(
      planIceRecovery({
        phase: "connected",
        direction: "incoming",
        iceState: "disconnected",
        dropElapsedMs: ICE_RESTART_WINDOW_MS,
        restartInFlight: false,
      }),
    ).toEqual({ type: "end" });
    expect(
      planIceRecovery({
        phase: "connected",
        direction: "outgoing",
        iceState: "connected",
        dropElapsedMs: 0,
        restartInFlight: false,
      }),
    ).toEqual({ type: "none" });
    expect(
      planIceRecovery({
        phase: "incoming",
        direction: "incoming",
        iceState: "failed",
        dropElapsedMs: 0,
        restartInFlight: false,
      }),
    ).toEqual({ type: "none" });
  });
});
