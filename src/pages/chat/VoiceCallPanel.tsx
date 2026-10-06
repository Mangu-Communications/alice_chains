import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { useVoiceCall } from "@/hooks/useVoiceCall";
import { canStartVoiceCall } from "@/lib/voice-call";
import {
  callPanelDismissKey,
  callPanelInitialAction,
  nextFocusIndex,
} from "@/lib/keyboard-nav";
import { trpc } from "@/providers/trpc";

type SocketApi = Parameters<typeof useVoiceCall>[1];

function bindStream(node: HTMLVideoElement | null, stream: MediaStream | null) {
  if (!node) return;
  if (node.srcObject !== stream) node.srcObject = stream;
}

/**
 * P-CALL-2/3/4/5. 1:1 voice and video controls. Groups stay text. TURN credentials are fetched per call.
 * Drops under 10s recover in the session; this panel only shows the quality label.
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
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
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

  const dialogOpen = live || ended;
  useEffect(() => {
    if (!dialogOpen) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const action = callPanelInitialAction(call.session.phase);
    panelRef.current?.querySelector<HTMLElement>(`[data-call-action="${action}"]`)?.focus();
    return () => {
      returnFocusRef.current?.focus();
    };
  }, [dialogOpen, call.session.phase]);

  function onDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (callPanelDismissKey(event.key)) {
      event.preventDefault();
      if (call.session.phase === "ended") call.dismiss();
      else call.hangup(call.session.phase === "incoming" ? "decline" : "hangup");
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const items = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled])"),
    );
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    items[nextFocusIndex(current, items.length, event.shiftKey)]?.focus();
  }

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
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="call-dialog-status"
          onKeyDown={onDialogKeyDown}
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
          <p id="call-dialog-status" className="text-sm font-medium">{status}</p>
          {live && (
            <p className="mt-1 text-xs text-muted-foreground">{qualityLabel}</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            {call.session.phase === "incoming" && (
              <Button data-call-action="accept" aria-label={t("a11y.acceptCall")} onClick={() => void call.accept()}>
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
                data-call-action="end"
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
              <Button data-call-action="dismiss" variant="ghost" onClick={call.dismiss}>
                {t("a11y.closeSearch")}
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
