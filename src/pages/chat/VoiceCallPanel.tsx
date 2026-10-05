import { useCallback, useEffect, useRef } from "react";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { useVoiceCall } from "@/hooks/useVoiceCall";
import { canStartVoiceCall } from "@/lib/voice-call";
import { trpc } from "@/providers/trpc";

type SocketApi = Parameters<typeof useVoiceCall>[1];

function bindStream(node: HTMLVideoElement | null, stream: MediaStream | null) {
  if (!node) return;
  if (node.srcObject !== stream) node.srcObject = stream;
}

/**
 * P-CALL-2/3/4. 1:1 voice and video controls. Groups stay text. TURN credentials are fetched per call.
 */
export function VoiceCallPanel({
  selfId,
  conversationId,
  peerUserId,
  peerName,
  isDirect,
  conversations,
  socket,
}: {
  selfId: number | null;
  conversationId: number | null;
  peerUserId: number | null;
  peerName: string;
  isDirect: boolean;
  conversations: readonly { id: number; displayName: string }[];
  socket: SocketApi;
}) {
  const utils = trpc.useUtils();
  const getIceServers = useCallback(
    () => utils.turn.iceServers.fetch().then((issued) => issued.iceServers),
    [utils]
  );
  const call = useVoiceCall(selfId, socket, getIceServers);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);
  const callerName =
    (call.session.conversationId !== null
      ? conversations.find((c) => c.id === call.session.conversationId)?.displayName
      : null) || peerName || "Someone";
  const showButton = canStartVoiceCall({
    isDirect,
    peerUserId,
    phase: call.session.phase,
  });
  const live = call.session.phase !== "idle" && call.session.phase !== "ended";
  const ended = call.session.phase === "ended";
  const video = call.session.kind === "video";
  const qualityLabel =
    call.quality === "good"
      ? t("call.quality.good")
      : call.quality === "poor"
        ? t("call.quality.poor")
        : call.quality === "failed"
          ? t("call.quality.failed")
          : t("call.quality.connecting");

  useEffect(() => {
    bindStream(remoteRef.current, call.remoteStream);
  }, [call.remoteStream, video, live]);

  useEffect(() => {
    bindStream(localRef.current, call.localStream);
  }, [call.localStream, video, live]);

  const status =
    call.session.phase === "incoming"
      ? video
        ? t("call.incomingVideo", callerName)
        : t("call.incoming", callerName)
      : call.session.phase === "outgoing"
        ? video
          ? t("call.outgoingVideo", callerName)
          : t("call.outgoing", callerName)
        : call.session.phase === "connected" || call.session.phase === "connecting"
          ? video
            ? t("call.connectedVideo")
            : t("call.connected")
          : call.session.endReason === "offline"
            ? t("call.offline")
            : call.session.endReason === "busy"
              ? t("call.busy")
              : call.session.endReason === "decline"
                ? t("call.declined")
                : call.session.endReason === "failed"
                  ? t("call.failed")
                  : t("call.ended");

  return (
    <>
      {showButton && conversationId !== null && peerUserId !== null && (
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("a11y.startCall")}
            onClick={() => void call.start(conversationId, peerUserId, "audio")}
          >
            <Phone className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("a11y.startVideoCall")}
            onClick={() => void call.start(conversationId, peerUserId, "video")}
          >
            <Video className="w-4 h-4" />
          </Button>
        </>
      )}
      {(live || ended) && (
        <div
          role="dialog"
          aria-label={video ? t("a11y.startVideoCall") : t("a11y.startCall")}
          className={`fixed bottom-4 right-4 z-50 rounded-lg border border-border bg-card p-4 shadow-lg ${video ? "w-80" : "w-72"}`}
        >
          {video && live && (
            <div className="relative mb-3 aspect-video overflow-hidden rounded-md bg-muted">
              <video
                ref={remoteRef}
                autoPlay
                playsInline
                aria-label={t("call.remoteVideo")}
                className="h-full w-full object-cover"
              />
              <video
                ref={localRef}
                autoPlay
                muted
                playsInline
                aria-label={t("call.localVideo")}
                className="absolute bottom-2 right-2 h-16 w-24 rounded border border-border object-cover"
              />
            </div>
          )}
          <p className="text-sm font-medium">{status}</p>
          {live && (
            <p className="mt-1 text-xs text-muted-foreground">{qualityLabel}</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            {call.session.phase === "incoming" && (
              <Button aria-label={t("a11y.acceptCall")} onClick={() => void call.accept()}>
                <Phone className="w-4 h-4" />
                {t("a11y.acceptCall")}
              </Button>
            )}
            {live && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={call.muted ? t("a11y.unmuteCall") : t("a11y.muteCall")}
                onClick={call.toggleMute}
              >
                {call.muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
            )}
            {live && video && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={call.cameraOff ? t("a11y.cameraOn") : t("a11y.cameraOff")}
                onClick={call.toggleCamera}
              >
                {call.cameraOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
              </Button>
            )}
            {live && (
              <Button
                variant="destructive"
                aria-label={
                  call.session.phase === "incoming" ? t("a11y.declineCall") : t("a11y.endCall")
                }
                onClick={() =>
                  call.hangup(call.session.phase === "incoming" ? "decline" : "hangup")
                }
              >
                <PhoneOff className="w-4 h-4" />
                {call.session.phase === "incoming" ? t("a11y.declineCall") : t("a11y.endCall")}
              </Button>
            )}
            {ended && (
              <Button variant="ghost" onClick={call.dismiss}>
                {t("a11y.closeSearch")}
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
