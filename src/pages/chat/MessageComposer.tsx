/**
 * S-0 slice 4 — composer, presentational only.
 *
 * Chat.tsx still owns the draft, typing signal, paste-to-attach, emoji
 * caret insert, outbox send, and the height effect. This component renders
 * the same input the page used to render inline.
 */
import type { ClipboardEvent, KeyboardEvent, RefObject } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmojiPicker } from "@/components/EmojiPicker";
import { t } from "@/i18n";
import { ALLOWED_MIME_TYPES } from "@contracts/attachments";
import {
  composerAriaLabel,
  composerPlaceholder,
  replyTargetName,
  sendDisabled,
} from "./composer-display";

export type ComposerReply = {
  senderName: string | null;
  content: string;
};

export type ComposerCounter = {
  visible: boolean;
  over: boolean;
  remaining: number;
};

export type MessageComposerProps = {
  messageInput: string;
  replyingTo: ComposerReply | null;
  uploading: boolean;
  counter: ComposerCounter;
  fileInputRef: RefObject<HTMLInputElement | null>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  onMessageInput: (value: string) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onCancelReply: () => void;
  onFilesSelected: (files: FileList | null) => void;
  onInsertEmoji: (emoji: string) => void;
  onSend: () => void;
};

export function MessageComposer({
  messageInput,
  replyingTo,
  uploading,
  counter,
  fileInputRef,
  composerRef,
  onMessageInput,
  onPaste,
  onKeyDown,
  onCancelReply,
  onFilesSelected,
  onInsertEmoji,
  onSend,
}: MessageComposerProps) {
  return (
    <div className="p-4 border-t border-border">
      {replyingTo && (
        <div className="max-w-4xl mx-auto mb-2 flex items-start gap-2 rounded-lg bg-secondary/50 border-l-2 border-primary px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-primary">
              Replying to {replyTargetName(replyingTo.senderName)}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {replyingTo.content}
            </p>
          </div>
          <button
            onClick={onCancelReply}
            aria-label={t("a11y.cancelReply")}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          accept={ALLOWED_MIME_TYPES.join(",")}
          onChange={(e) => onFilesSelected(e.target.files)}
        />
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-label={uploading ? t("a11y.uploading") : t("a11y.attachFile")}
        >
          {uploading ? (
            <Spinner className="w-5 h-5" />
          ) : (
            <Paperclip className="w-5 h-5 text-muted-foreground" />
          )}
        </Button>
        <EmojiPicker onSelect={onInsertEmoji} />
        <div className="flex-1 relative">
          <textarea
            ref={composerRef}
            value={messageInput}
            onChange={(e) => onMessageInput(e.target.value)}
            onPaste={onPaste}
            aria-describedby={counter.visible ? "composer-counter" : undefined}
            onKeyDown={(e) => {
              // Escape drops the reply target before it reaches the
              // send handler, so the key does something useful whether
              // or not a reply is in progress.
              if (e.key === "Escape" && replyingTo) {
                e.preventDefault();
                onCancelReply();
                return;
              }
              onKeyDown(e);
            }}
            aria-label={composerAriaLabel(!!replyingTo, replyingTo?.senderName)}
            placeholder={composerPlaceholder(!!replyingTo)}
            rows={1}
            className="w-full resize-none rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 min-h-[44px] max-h-[120px]"
            style={{ scrollbarWidth: "none" }}
          />
        </div>
        <Button
          onClick={onSend}
          disabled={sendDisabled(messageInput, counter.over)}
          aria-label={t("a11y.sendMessage")}
          size="icon"
          className="flex-shrink-0 rounded-xl h-11 w-11"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
      {counter.visible && (
        <div className="max-w-4xl mx-auto mt-1 flex justify-end">
          <span
            id="composer-counter"
            className={`text-[11px] tabular-nums ${
              counter.over ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {counter.over
              ? t("composer.over", -counter.remaining)
              : t("composer.remaining", counter.remaining)}
          </span>
          {counter.over ? (
            <span className="sr-only" role="alert">
              {t("composer.overLimit")}
            </span>
          ) : (
            <span className="sr-only" role="status">
              {t("composer.nearLimit")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
