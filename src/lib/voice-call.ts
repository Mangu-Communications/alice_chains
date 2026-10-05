/**
 * P-CALL-2 1:1 voice call session.
 *
 * Signaling frames are already relayed (P-CALL-1). This module decides what
 * the page should do with them. Media (getUserMedia, RTCPeerConnection) stays
 * in the hook so the rules can be tested without a browser.
 *
 * Audio and video offers are both accepted. Camera capture is requested only
 * for kind "video". ICE restart is P-CALL-5. TURN credentials are P-CALL-4;
 * a public STUN server is only a connectivity hint until that card ships.
 */

export type CallEndReason = "hangup" | "decline" | "busy" | "failed";

export type CallKind = "audio" | "video";

export type VoiceCallPhase =
  | "idle"
  | "outgoing"
  | "incoming"
  | "connecting"
  | "connected"
  | "ended";

export type CallOfferEvent = {
  conversationId: number;
  callId: string;
  fromUserId: number;
  targetUserId: number;
  sdp: string;
  kind: "audio" | "video";
};

export type CallEndEvent = {
  conversationId: number;
  callId: string;
  fromUserId: number;
  targetUserId: number;
  reason?: CallEndReason;
};

export type VoiceCallState = {
  phase: VoiceCallPhase;
  callId: string | null;
  conversationId: number | null;
  peerUserId: number | null;
  direction: "outgoing" | "incoming" | null;
  kind: CallKind | null;
  remoteSdp: string | null;
  endReason: CallEndReason | "offline" | null;
};

export type CallEffect =
  | { type: "none" }
  | {
      type: "reply-end";
      callId: string;
      conversationId: number;
      targetUserId: number;
      reason: CallEndReason;
    };

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

export function idleVoiceCall(): VoiceCallState {
  return {
    phase: "idle",
    callId: null,
    conversationId: null,
    peerUserId: null,
    direction: null,
    kind: null,
    remoteSdp: null,
    endReason: null,
  };
}

/** Camera is requested only for a video call. Mic is always on. */
export function mediaConstraints(kind: CallKind): { audio: true; video: boolean } {
  return { audio: true, video: kind === "video" };
}

export function createCallId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `call-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isLive(phase: VoiceCallPhase): boolean {
  return phase === "outgoing" || phase === "incoming" || phase === "connecting" || phase === "connected";
}

function replyEnd(
  callId: string,
  conversationId: number,
  targetUserId: number,
  reason: CallEndReason,
): CallEffect {
  return { type: "reply-end", callId, conversationId, targetUserId, reason };
}

/**
 * One step of the call session. Effects are replies the page must emit; the
 * reducer itself never touches the socket.
 */
export function applyVoiceCall(
  state: VoiceCallState,
  action:
    | { type: "start"; callId: string; conversationId: number; peerUserId: number; kind?: CallKind }
    | { type: "offer"; event: CallOfferEvent; selfId: number }
    | { type: "accept" }
    | { type: "local-connected" }
    | { type: "remote-end"; event: CallEndEvent; selfId: number }
    | { type: "local-end"; reason: CallEndReason }
    | { type: "offline"; callId: string }
    | { type: "reset" },
): { state: VoiceCallState; effect: CallEffect } {
  const none = { state, effect: { type: "none" } as CallEffect };

  switch (action.type) {
    case "reset":
      return { state: idleVoiceCall(), effect: { type: "none" } };
    case "start": {
      if (isLive(state.phase)) return none;
      if (!Number.isInteger(action.peerUserId) || action.peerUserId <= 0) return none;
      return {
        state: {
          phase: "outgoing",
          callId: action.callId,
          conversationId: action.conversationId,
          peerUserId: action.peerUserId,
          direction: "outgoing",
          kind: action.kind === "video" ? "video" : "audio",
          remoteSdp: null,
          endReason: null,
        },
        effect: { type: "none" },
      };
    }
    case "offer": {
      const event = action.event;
      if (event.targetUserId !== action.selfId) return none;
      if (event.kind !== "audio" && event.kind !== "video") {
        return {
          state,
          effect: replyEnd(event.callId, event.conversationId, event.fromUserId, "failed"),
        };
      }
      if (isLive(state.phase)) {
        return {
          state,
          effect: replyEnd(event.callId, event.conversationId, event.fromUserId, "busy"),
        };
      }
      return {
        state: {
          phase: "incoming",
          callId: event.callId,
          conversationId: event.conversationId,
          peerUserId: event.fromUserId,
          direction: "incoming",
          kind: event.kind,
          remoteSdp: event.sdp,
          endReason: null,
        },
        effect: { type: "none" },
      };
    }
    case "accept": {
      if (state.phase !== "incoming" || !state.remoteSdp) return none;
      return { state: { ...state, phase: "connecting" }, effect: { type: "none" } };
    }
    case "local-connected": {
      if (state.phase !== "outgoing" && state.phase !== "connecting") return none;
      return { state: { ...state, phase: "connected" }, effect: { type: "none" } };
    }
    case "remote-end": {
      const event = action.event;
      if (state.callId === null || event.callId !== state.callId) return none;
      if (event.targetUserId !== action.selfId && event.fromUserId !== state.peerUserId) return none;
      return {
        state: {
          ...state,
          phase: "ended",
          endReason: event.reason ?? "hangup",
        },
        effect: { type: "none" },
      };
    }
    case "local-end": {
      if (!isLive(state.phase) || state.callId === null || state.conversationId === null || state.peerUserId === null) {
        return none;
      }
      return {
        state: { ...state, phase: "ended", endReason: action.reason },
        effect: replyEnd(state.callId, state.conversationId, state.peerUserId, action.reason),
      };
    }
    case "offline": {
      if (state.phase !== "outgoing" || state.callId !== action.callId) return none;
      return {
        state: { ...state, phase: "ended", endReason: "offline" },
        effect: { type: "none" },
      };
    }
    default:
      return none;
  }
}

/** Direct chats only. Groups stay text until a later call card. */
export function canStartVoiceCall(input: {
  isDirect: boolean;
  peerUserId: number | null;
  phase: VoiceCallPhase;
}): boolean {
  return input.isDirect && input.peerUserId !== null && !isLive(input.phase);
}

/** Connection quality from ICE, not a restart (that is P-CALL-5). */
export function qualityFromIce(iceState: string): "connecting" | "good" | "poor" | "failed" {
  if (iceState === "connected" || iceState === "completed") return "good";
  if (iceState === "disconnected") return "poor";
  if (iceState === "failed" || iceState === "closed") return "failed";
  return "connecting";
}
