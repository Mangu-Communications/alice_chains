import { describe, expect, it } from "vitest";
import {
  applyVoiceCall,
  canStartVoiceCall,
  idleVoiceCall,
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

  it("declines a video offer; camera UI is P-CALL-3", () => {
    const next = applyVoiceCall(idleVoiceCall(), {
      type: "offer",
      event: offer({ kind: "video" }),
      selfId: 2,
    });
    expect(next.state.phase).toBe("idle");
    expect(next.effect).toEqual({
      type: "reply-end",
      callId: "c1",
      conversationId: 4,
      targetUserId: 8,
      reason: "failed",
    });
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
  it("maps ICE states to a quality label without restarting", () => {
    expect(qualityFromIce("checking")).toBe("connecting");
    expect(qualityFromIce("connected")).toBe("good");
    expect(qualityFromIce("completed")).toBe("good");
    expect(qualityFromIce("disconnected")).toBe("poor");
    expect(qualityFromIce("failed")).toBe("failed");
  });
});
