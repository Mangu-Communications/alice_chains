/**
 * S-0 slice 3 — message log, presentational only.
 *
 * Chat.tsx still owns the message query, edit draft, reactions, delete,
 * and the outbox. This component renders the same log the page used to
 * render inline. Jump anchors stay on `data-message-id`.
 */
import type { RefObject } from "react";
import {
  Check,
  CheckCheck,
  Clock,
  FileText,
  MoreVertical,
  Pencil,
  Reply,
  SmilePlus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t, formatTime } from "@/i18n";
import { Linkify } from "@/lib/linkify";
import { avatarInitial } from "@/lib/chat-display";
import { MAX_MESSAGE_LENGTH } from "@contracts/constants";
import { REACTION_EMOJI } from "@contracts/reactions";
import { formatBytes } from "@contracts/attachments";
import {
  isFirstInSenderGroup,
  pendingSendLabel,
  receiptIsRead,
  replyAuthorLabel,
  replyPreviewText,
  showSenderAvatar,
} from "./message-display";

export type ThreadAttachment = {
  id: number;
  isImage: boolean;
  url: string;
  fileName: string;
  byteSize: number;
};

export type ThreadReaction = {
  emoji: string;
  mine: boolean;
  count: number;
};

export type ThreadMessage = {
  id: number;
  isMine: boolean;
  senderId: number;
  senderAvatar: string | null;
  senderName: string | null;
  replyToId: number | null;
  deletedAt: Date | string | null;
  replyToSenderId: number | null;
  replyToSenderName: string | null;
  replyToDeletedAt: Date | string | null;
  replyToContent: string | null;
  content: string;
  createdAt: Date | string | number;
  isEdited: boolean;
  readBy: unknown[] | null;
  attachments: ThreadAttachment[];
  reactions: ThreadReaction[];
};

export type ThreadPending = {
  tempId: string;
  conversationId: number;
  content: string;
};

export type MessageThreadProps = {
  messages: ThreadMessage[] | undefined;
  highlightedMessageId: number | null;
  editingMessageId: number | null;
  editDraft: string;
  editPending: boolean;
  pendingDeleteId: number | null;
  selfId: number | undefined;
  pending: ThreadPending[];
  activeConversationId: number | null;
  socketConnected: boolean;
  showTyping: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onEditDraftChange: (draft: string) => void;
  onSubmitEdit: () => void;
  onCancelEdit: () => void;
  onReply: (message: ThreadMessage) => void;
  onReact: (messageId: number, emoji: (typeof REACTION_EMOJI)[number]) => void;
  onStartEdit: (messageId: number, content: string) => void;
  onDelete: (messageId: number) => void;
  /** H-9. Present only when another older page may exist. */
  hasOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
};

export function MessageThread({
  messages,
  highlightedMessageId,
  editingMessageId,
  editDraft,
  editPending,
  pendingDeleteId,
  selfId,
  pending,
  activeConversationId,
  socketConnected,
  showTyping,
  messagesEndRef,
  onEditDraftChange,
  onSubmitEdit,
  onCancelEdit,
  onReply,
  onReact,
  onStartEdit,
  onDelete,
  hasOlder = false,
  loadingOlder = false,
  onLoadOlder,
}: MessageThreadProps) {
  return (
    <ScrollArea className="flex-1 px-4">
      {/*
        A log, not a list: `role="log"` tells a screen reader that
        entries are appended over time, which is what makes its
        "read new entries" behaviour work.
      */}
      <div className="py-4 space-y-1" role="log" aria-label="Messages">
        {hasOlder && (
          <div className="flex justify-center pb-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onLoadOlder}
              disabled={loadingOlder || !onLoadOlder}
            >
              {loadingOlder ? t("thread.loadingOlder") : t("thread.loadOlder")}
            </Button>
          </div>
        )}
        {messages?.map((msg, i) => {
          const previousSenderId = i === 0 ? undefined : messages[i - 1].senderId;
          const showAvatar = showSenderAvatar(msg.isMine, i, previousSenderId, msg.senderId);
          const isFirstInGroup = isFirstInSenderGroup(i, previousSenderId, msg.senderId);

          return (
            <div
              key={msg.id}
              // P-UX-4. The anchor a jump scrolls to. It is on the row
              // rather than the bubble so the ring encloses the whole
              // message, avatar included.
              data-message-id={msg.id}
              className={`flex ${
                msg.isMine ? "justify-end" : "justify-start"
              } mb-1 scroll-mt-4 rounded-xl transition-colors duration-500 ${
                highlightedMessageId === msg.id
                  ? "bg-primary/10 ring-1 ring-primary/40"
                  : ""
              }`}
            >
              <div
                className={`flex items-end gap-2 max-w-[75%] ${
                  msg.isMine ? "flex-row-reverse" : ""
                }`}
              >
                {showAvatar ? (
                  <Avatar className="w-7 h-7 flex-shrink-0">
                    <AvatarImage src={msg.senderAvatar || undefined} />
                    <AvatarFallback className="text-[10px] bg-primary/20">
                      {avatarInitial(msg.senderName, "")}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  !msg.isMine && <div className="w-7 flex-shrink-0" />
                )}
                <div
                  className={`group px-4 py-2 text-sm leading-relaxed ${
                    msg.isMine ? "message-bubble-mine" : "message-bubble-theirs"
                  } ${isFirstInGroup ? "mt-2" : ""}`}
                >
                  {!msg.isMine && showAvatar && (
                    <p className="text-[11px] font-medium text-primary/70 mb-1">
                      {msg.senderName}
                    </p>
                  )}
                  {msg.replyToId && !msg.deletedAt && (
                    <div className="mb-1.5 pl-2 border-l-2 border-current/30 opacity-70">
                      <p className="text-[11px] font-medium">
                        {replyAuthorLabel(msg.replyToSenderId, selfId, msg.replyToSenderName)}
                      </p>
                      <p className="text-[11px] truncate max-w-[240px]">
                        {replyPreviewText(msg.replyToDeletedAt, msg.replyToContent)}
                      </p>
                    </div>
                  )}
                  {msg.deletedAt ? (
                    <p className="italic opacity-60">{t("status.messageDeleted")}</p>
                  ) : editingMessageId === msg.id ? (
                    <div className="space-y-2">
                      <Input
                        value={editDraft}
                        onChange={(e) => onEditDraftChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            onSubmitEdit();
                          }
                          if (e.key === "Escape") onCancelEdit();
                        }}
                        maxLength={MAX_MESSAGE_LENGTH}
                        aria-label={t("a11y.editMessage")}
                        autoFocus
                        className="h-8 bg-background/40 border-0"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={onSubmitEdit}
                          disabled={editPending}
                        >
                          {editPending ? "Saving…" : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={onCancelEdit}
                          disabled={editPending}
                        >
                          Cancel
                        </Button>
                        <span className="text-[10px] opacity-60">
                          Enter to save · Esc to cancel
                        </span>
                      </div>
                    </div>
                  ) : (
                    // P-LINK-1. Still text: `Linkify` returns React
                    // elements from a parsed split, never markup from
                    // message content, so FR-MSG-18 holds.
                    <p className="whitespace-pre-wrap break-words">
                      <Linkify text={msg.content} />
                    </p>
                  )}
                  <div
                    className={`flex items-center gap-1 mt-1 ${
                      msg.isMine ? "justify-end" : "justify-start"
                    }`}
                  >
                    <span className="text-[10px] opacity-60">
                      {formatTime(msg.createdAt)}
                    </span>
                    {msg.isEdited && !msg.deletedAt && (
                      <span className="text-[10px] opacity-60">{t("status.edited")}</span>
                    )}
                    {msg.isMine && !msg.deletedAt && (
                      <span className="opacity-60">
                        {receiptIsRead(msg.readBy?.length ?? 0) ? (
                          <CheckCheck className="w-3 h-3" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                      </span>
                    )}
                    {!msg.deletedAt && editingMessageId !== msg.id && (
                      <button
                        onClick={() => onReply(msg)}
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus:opacity-100 transition-opacity ml-1"
                        aria-label={t("a11y.replyToMessage")}
                      >
                        <Reply className="w-3 h-3" />
                      </button>
                    )}
                    {!msg.deletedAt && editingMessageId !== msg.id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus:opacity-100 transition-opacity ml-1"
                            aria-label={t("a11y.addReaction")}
                          >
                            <SmilePlus className="w-3 h-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align={msg.isMine ? "end" : "start"}
                          className="flex gap-1 p-1 min-w-0"
                        >
                          {REACTION_EMOJI.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => onReact(msg.id, emoji)}
                              className="text-lg leading-none p-1.5 rounded-md hover:bg-secondary transition-colors"
                              aria-label={t("a11y.reactWith", emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {msg.isMine && !msg.deletedAt && editingMessageId !== msg.id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus:opacity-100 transition-opacity ml-1"
                            aria-label={t("a11y.messageActions")}
                          >
                            <MoreVertical className="w-3 h-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => onStartEdit(msg.id, msg.content)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2 text-destructive"
                            onClick={() => onDelete(msg.id)}
                            disabled={pendingDeleteId === msg.id}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {pendingDeleteId === msg.id ? "Deleting…" : "Delete"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  {!msg.deletedAt &&
                    msg.attachments.map((attachment) =>
                      attachment.isImage ? (
                        <a
                          key={attachment.id}
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block mt-2"
                        >
                          <img
                            src={attachment.url}
                            alt={attachment.fileName}
                            loading="lazy"
                            className="rounded-lg max-h-64 max-w-full object-contain bg-background/20"
                          />
                        </a>
                      ) : (
                        <a
                          key={attachment.id}
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={attachment.fileName}
                          className="mt-2 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-background/25 hover:bg-background/40 transition-colors"
                        >
                          <FileText className="w-4 h-4 flex-shrink-0" />
                          <span className="flex-1 min-w-0 truncate text-xs">
                            {attachment.fileName}
                          </span>
                          <span className="text-[10px] opacity-70 flex-shrink-0">
                            {formatBytes(attachment.byteSize)}
                          </span>
                        </a>
                      ),
                    )}
                  {msg.reactions.length > 0 && !msg.deletedAt && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {msg.reactions.map((reaction) => (
                        <button
                          key={reaction.emoji}
                          onClick={() =>
                            onReact(msg.id, reaction.emoji as (typeof REACTION_EMOJI)[number])
                          }
                          className={`flex items-center gap-1 px-1.5 h-6 rounded-full text-[11px] border transition-colors ${
                            reaction.mine
                              ? "bg-primary/20 border-primary/40"
                              : "bg-background/30 border-border/50 hover:bg-background/50"
                          }`}
                          aria-pressed={reaction.mine}
                          aria-label={t(
                            "count.reactions",
                            reaction.emoji,
                            reaction.count,
                            reaction.mine,
                          )}
                        >
                          <span aria-hidden="true">{reaction.emoji}</span>
                          <span aria-hidden="true" className="tabular-nums">
                            {reaction.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/*
          Queued sends, shown in place rather than hidden: a member who
          typed something offline should see it sitting there rather
          than wonder whether it went.
        */}
        {pending
          .filter((entry) => entry.conversationId === activeConversationId)
          .map((entry) => (
            <div key={entry.tempId} className="flex justify-end mb-1">
              <div className="flex items-end gap-2 max-w-[75%] flex-row-reverse">
                <div className="px-4 py-2 text-sm leading-relaxed message-bubble-mine opacity-60">
                  <p className="whitespace-pre-wrap break-words">{entry.content}</p>
                  <div className="flex items-center gap-1 mt-1 justify-end">
                    <Clock className="w-3 h-3" aria-hidden="true" />
                    <span className="text-[10px]">{pendingSendLabel(socketConnected)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

        {showTyping && (
          <div className="flex items-center gap-2 py-2">
            <div className="flex gap-1 px-4 py-2 bg-secondary rounded-2xl rounded-bl-sm">
              <span
                className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
}
