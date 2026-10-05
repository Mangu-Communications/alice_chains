import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyVoiceCall,
  createCallId,
  DEFAULT_ICE_SERVERS,
  idleVoiceCall,
  qualityFromIce,
  type CallEndReason,
  type VoiceCallState,
} from "@/lib/voice-call";
import type { useSocket } from "@/hooks/useSocket";

type SocketApi = Pick<
  ReturnType<typeof useSocket>,
  | "emitCallOffer"
  | "emitCallAnswer"
  | "emitCallIceCandidate"
  | "emitCallEnd"
  | "onCallOffer"
  | "onCallAnswer"
  | "onCallIceCandidate"
  | "onCallEnd"
  | "onCallError"
>;

/**
 * P-CALL-2. Places a 1:1 audio call on the P-CALL-1 socket events.
 * No camera (P-CALL-3). No TURN credential fetch (P-CALL-4). No ICE restart
 * (P-CALL-5).
 */
export function useVoiceCall(selfId: number | null, socket: SocketApi) {
  const [session, setSession] = useState<VoiceCallState>(idleVoiceCall);
  const [muted, setMuted] = useState(false);
  const [quality, setQuality] = useState<ReturnType<typeof qualityFromIce>>("connecting");
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);

  const stopMedia = useCallback(() => {
    pendingIce.current = [];
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    setMuted(false);
    setQuality("connecting");
  }, []);

  const emitEffect = useCallback(
    (effect: ReturnType<typeof applyVoiceCall>["effect"]) => {
      if (effect.type === "reply-end") {
        socket.emitCallEnd({
          conversationId: effect.conversationId,
          callId: effect.callId,
          targetUserId: effect.targetUserId,
          reason: effect.reason,
        });
      }
    },
    [socket]
  );

  const transition = useCallback(
    (action: Parameters<typeof applyVoiceCall>[1]) => {
      const next = applyVoiceCall(sessionRef.current, action);
      sessionRef.current = next.state;
      setSession(next.state);
      emitEffect(next.effect);
      if (next.state.phase === "ended") stopMedia();
      return next.state;
    },
    [emitEffect, stopMedia]
  );

  const flushIce = useCallback(async (pc: RTCPeerConnection) => {
    const queued = pendingIce.current;
    pendingIce.current = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // A late candidate after hangup is not a call failure.
      }
    }
  }, []);

  const openPeer = useCallback(
    (callId: string, conversationId: number, peerUserId: number, stream: MediaStream) => {
      const pc = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
      pcRef.current = pc;
      for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        socket.emitCallIceCandidate({
          conversationId,
          callId,
          targetUserId: peerUserId,
          candidate: JSON.stringify(event.candidate.toJSON()),
        });
      };
      pc.oniceconnectionstatechange = () => {
        const label = qualityFromIce(pc.iceConnectionState);
        setQuality(label);
        if (label === "good") transition({ type: "local-connected" });
        if (label === "failed") transition({ type: "local-end", reason: "failed" });
      };
      return pc;
    },
    [socket, transition]
  );

  const start = useCallback(
    async (conversationId: number, peerUserId: number) => {
      if (selfId === null) return;
      const callId = createCallId();
      const started = transition({ type: "start", callId, conversationId, peerUserId });
      if (started.phase !== "outgoing") return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        const pc = openPeer(callId, conversationId, peerUserId, stream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emitCallOffer({
          conversationId,
          callId,
          targetUserId: peerUserId,
          sdp: offer.sdp ?? "",
          kind: "audio",
        });
      } catch {
        transition({ type: "local-end", reason: "failed" });
      }
    },
    [openPeer, selfId, socket, transition]
  );

  const accept = useCallback(async () => {
    const current = sessionRef.current;
    if (current.phase !== "incoming" || !current.remoteSdp || current.callId === null) return;
    const accepted = transition({ type: "accept" });
    if (accepted.phase !== "connecting" || accepted.peerUserId === null || accepted.conversationId === null) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      const pc = openPeer(accepted.callId!, accepted.conversationId, accepted.peerUserId, stream);
      await pc.setRemoteDescription({ type: "offer", sdp: accepted.remoteSdp! });
      await flushIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emitCallAnswer({
        conversationId: accepted.conversationId,
        callId: accepted.callId!,
        targetUserId: accepted.peerUserId,
        sdp: answer.sdp ?? "",
      });
    } catch {
      transition({ type: "local-end", reason: "failed" });
    }
  }, [flushIce, openPeer, socket, transition]);

  const hangup = useCallback(
    (reason: CallEndReason = "hangup") => {
      transition({ type: "local-end", reason });
    },
    [transition]
  );

  const toggleMute = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() ?? [];
    const next = !muted;
    for (const track of tracks) track.enabled = !next;
    setMuted(next);
  }, [muted]);

  useEffect(() => {
    if (selfId === null) return;
    const offOffer = socket.onCallOffer((event) => {
      transition({ type: "offer", event, selfId });
    });
    const offAnswer = socket.onCallAnswer(async (event) => {
      const current = sessionRef.current;
      if (current.callId !== event.callId || current.phase !== "outgoing") return;
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription({ type: "answer", sdp: event.sdp });
        await flushIce(pc);
      } catch {
        transition({ type: "local-end", reason: "failed" });
      }
    });
    const offIce = socket.onCallIceCandidate(async (event) => {
      const current = sessionRef.current;
      if (current.callId !== event.callId) return;
      let candidate: RTCIceCandidateInit;
      try {
        candidate = JSON.parse(event.candidate) as RTCIceCandidateInit;
      } catch {
        return;
      }
      const pc = pcRef.current;
      if (!pc || !pc.remoteDescription) {
        pendingIce.current.push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // ignore late candidates
      }
    });
    const offEnd = socket.onCallEnd((event) => {
      transition({ type: "remote-end", event, selfId });
    });
    const offError = socket.onCallError((event) => {
      transition({ type: "offline", callId: event.callId });
    });
    return () => {
      offOffer();
      offAnswer();
      offIce();
      offEnd();
      offError();
    };
  }, [flushIce, selfId, socket, transition]);

  useEffect(() => () => stopMedia(), [stopMedia]);

  return { session, quality, muted, start, accept, hangup, toggleMute, dismiss: () => transition({ type: "reset" }) };
}
