import { Phone, PhoneOff, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { useVoiceCall } from "@/hooks/useVoiceCall";
import { canStartVoiceCall } from "@/lib/voice-call";

type SocketApi = Parameters<typeof useVoiceCall>[1];

/**
 * P-CALL-2. 1:1 voice controls. The video button stays absent until P-CALL-3.
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
  const call = useVoiceCall(selfId, socket);
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
  const qualityLabel =
    call.quality === "good"
      ? t("call.quality.good")
      : call.quality === "poor"
        ? t("call.quality.poor")
        : call.quality === "failed"
          ? t("call.quality.failed")
          : t("call.quality.connecting");

  return (
    <>
      {showButton && conversationId !== null && peerUserId !== null && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("a11y.startCall")}
          onClick={() => void call.start(conversationId, peerUserId)}
        >
          <Phone className="w-4 h-4" />
        </Button>
      )}
      {(live || ended) && (
        <div
          role="dialog"
          aria-label={t("a11y.startCall")}
          className="fixed bottom-4 right-4 z-50 w-72 rounded-lg border border-border bg-card p-4 shadow-lg"
        >
          <p className="text-sm font-medium">
            {call.session.phase === "incoming"
              ? t("call.incoming", callerName)
              : call.session.phase === "outgoing"
                ? t("call.outgoing", callerName)
                : call.session.phase === "connected" || call.session.phase === "connecting"
                  ? t("call.connected")
                  : call.session.endReason === "offline"
                    ? t("call.offline")
                    : call.session.endReason === "busy"
                      ? t("call.busy")
                      : call.session.endReason === "decline"
                        ? t("call.declined")
                        : call.session.endReason === "failed"
                          ? t("call.failed")
                          : t("call.ended")}
          </p>
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
