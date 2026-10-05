import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyVoiceCall,
  createCallId,
  DEFAULT_ICE_SERVERS,
  ICE_RESTART_WINDOW_MS,
  idleVoiceCall,
  mediaConstraints,
  planIceRecovery,
  qualityFromIce,
  type CallEndReason,
  type CallKind,
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
 * P-CALL-2/3. Places a 1:1 audio or video call on the P-CALL-1 socket events.
 * TURN credentials come from turn.iceServers (P-CALL-4) when the panel supplies a fetcher.
 * A drop under 10s restarts ICE once from the outgoing side (P-CALL-5).
 */
async function resolveIceServers(
  getIceServers?: () => Promise<RTCIceServer[]>
): Promise<RTCIceServer[]> {
  if (!getIceServers) return DEFAULT_ICE_SERVERS;
  try {
    const issued = await getIceServers();
    if (issued.length > 0) return issued;
  } catch {
    // A credential fetch failure must not block a STUN call.
  }
  return DEFAULT_ICE_SERVERS;
}

export function useVoiceCall(
  selfId: number | null,
  socket: SocketApi,
  getIceServers?: () => Promise<RTCIceServer[]>
) {
  const [session, setSession] = useState<VoiceCallState>(idleVoiceCall);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [quality, setQuality] = useState<ReturnType<typeof qualityFromIce>>("connecting");
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const dropStartedAt = useRef<number | null>(null);
  const dropTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartInFlight = useRef(false);

  const clearDrop = useCallback(() => {
    dropStartedAt.current = null;
    restartInFlight.current = false;
    if (dropTimer.current) clearTimeout(dropTimer.current);
    dropTimer.current = null;
  }, []);

  const stopMedia = useCallback(() => {
    pendingIce.current = [];
    clearDrop();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraOff(false);
    setQuality("connecting");
  }, [clearDrop]);

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
      return next;
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
    async (callId: string, conversationId: number, peerUserId: number, stream: MediaStream) => {
      const iceServers = await resolveIceServers(getIceServers);
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      for (const track of stream.getTracks()) pc.addTrack(track, stream);
      pc.ontrack = (event) => {
        const [streamFromPeer] = event.streams;
        if (streamFromPeer) setRemoteStream(streamFromPeer);
      };
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
        const iceState = pc.iceConnectionState;
        const label = qualityFromIce(iceState);
        setQuality(label);
        if (label === "good") {
          clearDrop();
          transition({ type: "local-connected" });
          return;
        }
        if (iceState === "closed") {
          transition({ type: "local-end", reason: "failed" });
          return;
        }
        if (iceState !== "disconnected" && iceState !== "failed") return;
        if (dropStartedAt.current === null) dropStartedAt.current = Date.now();
        const current = sessionRef.current;
        const plan = planIceRecovery({
          phase: current.phase,
          direction: current.direction,
          iceState,
          dropElapsedMs: Date.now() - dropStartedAt.current,
          restartInFlight: restartInFlight.current,
        });
        if (plan.type === "end") {
          transition({ type: "local-end", reason: "failed" });
          return;
        }
        if (plan.type === "restart") {
          restartInFlight.current = true;
          void sendIceRestart();
        }
        if ((plan.type === "restart" || plan.type === "wait") && !dropTimer.current) {
          const remaining = Math.max(0, ICE_RESTART_WINDOW_MS - (Date.now() - dropStartedAt.current));
          dropTimer.current = setTimeout(() => {
            dropTimer.current = null;
            const live = sessionRef.current;
            const expired = planIceRecovery({
              phase: live.phase,
              direction: live.direction,
              iceState: "disconnected",
              dropElapsedMs: ICE_RESTART_WINDOW_MS,
              restartInFlight: restartInFlight.current,
            });
            if (expired.type === "end") transition({ type: "local-end", reason: "failed" });
          }, remaining);
        }
      };
      return pc;
    },
    [socket, transition, getIceServers, clearDrop]
  );

  const sendIceRestart = useCallback(async () => {
    const current = sessionRef.current;
    const pc = pcRef.current;
    if (!pc || current.callId === null || current.conversationId === null || current.peerUserId === null) return;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      socket.emitCallOffer({
        conversationId: current.conversationId,
        callId: current.callId,
        targetUserId: current.peerUserId,
        sdp: offer.sdp ?? "",
        kind: current.kind === "video" ? "video" : "audio",
      });
    } catch {
      transition({ type: "local-end", reason: "failed" });
    }
  }, [socket, transition]);

  const start = useCallback(
    async (conversationId: number, peerUserId: number, kind: CallKind = "audio") => {
      if (selfId === null) return;
      const callId = createCallId();
      const started = transition({ type: "start", callId, conversationId, peerUserId, kind }).state;
      if (started.phase !== "outgoing") return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints(started.kind ?? kind));
        localStreamRef.current = stream;
        setLocalStream(stream);
        const pc = await openPeer(callId, conversationId, peerUserId, stream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emitCallOffer({
          conversationId,
          callId,
          targetUserId: peerUserId,
          sdp: offer.sdp ?? "",
          kind: started.kind === "video" ? "video" : "audio",
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
    const accepted = transition({ type: "accept" }).state;
    if (accepted.phase !== "connecting" || accepted.peerUserId === null || accepted.conversationId === null) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        mediaConstraints(accepted.kind === "video" ? "video" : "audio"),
      );
      localStreamRef.current = stream;
      setLocalStream(stream);
      const pc = await openPeer(accepted.callId!, accepted.conversationId, accepted.peerUserId, stream);
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

  const toggleCamera = useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks() ?? [];
    if (tracks.length === 0) return;
    const next = !cameraOff;
    for (const track of tracks) track.enabled = !next;
    setCameraOff(next);
  }, [cameraOff]);

  useEffect(() => {
    if (selfId === null) return;
    const offOffer = socket.onCallOffer((event) => {
      const next = transition({ type: "offer", event, selfId });
      if (next.effect.type !== "renegotiate") return;
      const pc = pcRef.current;
      const current = sessionRef.current;
      if (!pc || current.callId === null || current.conversationId === null || current.peerUserId === null) return;
      void (async () => {
        try {
          await pc.setRemoteDescription({ type: "offer", sdp: event.sdp });
          await flushIce(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emitCallAnswer({
            conversationId: current.conversationId!,
            callId: current.callId!,
            targetUserId: current.peerUserId!,
            sdp: answer.sdp ?? "",
          });
        } catch {
          transition({ type: "local-end", reason: "failed" });
        }
      })();
    });
    const offAnswer = socket.onCallAnswer(async (event) => {
      const current = sessionRef.current;
      if (current.callId !== event.callId) return;
      if (current.phase !== "outgoing" && !restartInFlight.current) return;
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription({ type: "answer", sdp: event.sdp });
        await flushIce(pc);
        restartInFlight.current = false;
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

  return {
    session,
    quality,
    muted,
    cameraOff,
    localStream,
    remoteStream,
    start,
    accept,
    hangup,
    toggleMute,
    toggleCamera,
    dismiss: () => transition({ type: "reset" }),
  };
}
