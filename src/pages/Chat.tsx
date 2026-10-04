import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { usePersistedState } from "@/hooks/usePersistedState";
import { trpc } from "@/providers/trpc";
import { useNavigate } from "react-router";
import {
  MessageCircle,
  MoreVertical,
  Phone,
  Video,
  Search,
  Users,
  Images,
  Menu,
  X,
} from "lucide-react";
import { ConversationSidebar } from "@/pages/chat/ConversationSidebar";
import { MessageThread } from "@/pages/chat/MessageThread";
import { MessageComposer } from "@/pages/chat/MessageComposer";
import { GroupSettingsDialog } from "@/pages/chat/GroupSettingsDialog";
import { COMPOSER_MAX_HEIGHT } from "@/pages/chat/composer-display";
import {
  flattenMessagePages,
  MESSAGE_PAGE_SIZE,
  nextOlderCursor,
} from "@/pages/chat/message-pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { t, formatMessageTimestamp } from "@/i18n";
import { LiveRegion } from "@/components/LiveRegion";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Outbox, type OutboxEntry } from "@/lib/outbox";
import { MAX_MESSAGE_LENGTH, MIN_SEARCH_QUERY_LENGTH } from "@contracts/constants";
import { MediaDrawer } from "@/components/MediaDrawer";
import {
  counterState,
  filesFromClipboard,
  insertAtCaret,
} from "@/lib/composer";
import {
  avatarInitial,
  contactsNotInConversation,
  conversationMatchesQuery,
  isGroupOwner as callerIsGroupOwner,
  otherDirectMemberId,
} from "@/lib/chat-display";
import {
  MAX_ATTACHMENT_BYTES,
  formatBytes,
  isAllowedMimeType,
} from "@contracts/attachments";


/**
 * How long a jumped-to message stays highlighted (P-UX-4). Long enough to
 * find with the eye after the scroll settles, short enough not to become
 * part of the page.
 */
const JUMP_HIGHLIGHT_MS = 1600;

export default function Chat() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeConversationId = searchParams.get("c")
    ? parseInt(searchParams.get("c")!)
    : null;

  const socket = useSocket();
  // F-6. Permission is requested from a control the member pressed, never on
  // load — a prompt fired at arrival is the fastest route to a permanent no.
  const push = usePushNotifications();
  // P-PROF-2. The sidebar reset on every navigation. It is a preference, not
  // state, so it is remembered.
  const [sidebarOpen, setSidebarOpen] = usePersistedState("sidebar-open", true);
  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [typingUsers, setTypingUsers] = useState<Set<number>>(new Set());
  // F-2. The message currently being edited in place, and its draft body.
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  // F-5. The message the composer is currently replying to, if any.
  // S-20. What a screen reader should be told about, most recently. Rendered
  // into a polite live region below.
  const [announcement, setAnnouncement] = useState<string | null>(null);
  // P-SEARCH. The header's search icon was a stub S-20 removed rather than
  // leave lying; this is what brings it back, live.
  const [searchOpen, setSearchOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(
    null
  );
  const [messageQuery, setMessageQuery] = useState("");
  const [searchEverywhere, setSearchEverywhere] = useState(false);

  // P-UX-2. One outbox per mounted Chat. A ref rather than state because the
  // queue is the source of truth and `pending` is just a render of it.
  const outboxRef = useRef(new Outbox());
  const [pending, setPending] = useState<OutboxEntry[]>([]);
  useEffect(() => outboxRef.current.subscribe(setPending), []);
  const [replyingTo, setReplyingTo] = useState<{
    id: number;
    content: string;
    senderName: string | null;
  } | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());

  // tRPC queries
  const { data: conversations, refetch: refetchConversations } =
    trpc.conversation.list.useQuery();

  const { data: activeConversation } = trpc.conversation.getById.useQuery(
    { id: activeConversationId! },
    { enabled: !!activeConversationId }
  );

  // H-9. First page is still the latest 50 (no cursor). Older pages use the
  // oldest loaded id as an exclusive cursor. `refetch` still refreshes pages.
  const {
    data: messagePages,
    refetch: refetchMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.message.listByConversation.useInfiniteQuery(
    { conversationId: activeConversationId!, limit: MESSAGE_PAGE_SIZE },
    {
      enabled: !!activeConversationId,
      getNextPageParam: (lastPage) => nextOlderCursor(lastPage, MESSAGE_PAGE_SIZE),
    }
  );
  const messages = useMemo(
    () => (messagePages ? flattenMessagePages(messagePages.pages) : undefined),
    [messagePages]
  );

  // F-1. Opening a conversation clears its badge. This writes
  // `conversation_participants.lastReadAt`, which is what `conversation.list`
  // counts from — the socket `markAsRead` writes per-message receipts for the
  // sender's delivery ticks and does not move the read marker.
  const markConversationRead = trpc.conversation.markAsRead.useMutation({
    onSuccess: () => refetchConversations(),
  });

  // Depends on `.mutate`, which is stable across renders, rather than on the
  // mutation object, which is not — depending on the object would re-run the
  // effect below on every render and mark the conversation read in a loop.
  const { mutate: sendMarkRead } = markConversationRead;
  const markActiveConversationRead = useCallback(() => {
    if (!activeConversationId) return;
    sendMarkRead({ conversationId: activeConversationId });
  }, [activeConversationId, sendMarkRead]);

  useEffect(() => {
    markActiveConversationRead();
  }, [markActiveConversationRead]);

  const editMessage = trpc.message.edit.useMutation({
    onSuccess: () => {
      setEditingMessageId(null);
      setEditDraft("");
      refetchMessages();
      refetchConversations();
    },
    onError: (error) => toast.error(error.message),
  });

  // F-3. The server decides add-vs-remove from what is stored, so the client
  // sends only the emoji and re-renders from the summary that comes back.
  // F-7. Group administration lives behind the header menu; every mutation
  // refetches the conversation and the sidebar, and the server also fans out
  // `conversationUpdated` so other members converge without acting.
  // F-4. The paperclip was a button that did nothing. It now runs the
  // three-step upload the server expects: ask for a target, PUT the bytes
  // straight to storage, then send a message naming the attachment.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [uploading, setUploading] = useState(false);

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState("");

  const trimmedMessageQuery = messageQuery.trim();
  const messageQueryIsSearchable =
    trimmedMessageQuery.length >= MIN_SEARCH_QUERY_LENGTH;
  const messageSearch = trpc.message.search.useQuery(
    {
      query: trimmedMessageQuery,
      conversationId:
        searchEverywhere || !activeConversationId ? undefined : activeConversationId,
    },
    { enabled: searchOpen && messageQueryIsSearchable }
  );

  const { data: blockedContacts, refetch: refetchBlocked } =
    trpc.contact.blocked.useQuery();
  // Only accepted contacts can be added to a group, so the picker below shows
  // exactly the people the caller could legitimately invite.
  const { data: contacts } = trpc.contact.list.useQuery();

  const blockUser = trpc.contact.block.useMutation({
    onSuccess: () => {
      toast.success("Blocked. They can no longer message you.");
      refetchBlocked();
      refetchConversations();
    },
    onError: (error) => toast.error(error.message),
  });

  const unblockUser = trpc.contact.unblock.useMutation({
    onSuccess: () => {
      toast.success("Unblocked.");
      refetchBlocked();
      refetchConversations();
    },
    onError: (error) => toast.error(error.message),
  });

  const utils = trpc.useUtils();

  const setNotifyLevel = trpc.conversation.setNotifyLevel.useMutation({
    onSuccess: () => {
      utils.conversation.list.invalidate();
      utils.conversation.getById.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const createUpload = trpc.attachment.createUpload.useMutation();
  const completeUpload = trpc.attachment.complete.useMutation();
  const sendWithAttachment = trpc.message.send.useMutation({
    onSuccess: () => {
      refetchMessages();
      refetchConversations();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleFilesSelected = useCallback(
    async (files: ArrayLike<File> | null) => {
      if (!files?.length || !activeConversationId) return;
      const file = files[0];

      if (!isAllowedMimeType(file.type)) {
        toast.error(`${file.type || "That file type"} cannot be attached.`);
        return;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`Files must be ${formatBytes(MAX_ATTACHMENT_BYTES)} or smaller.`);
        return;
      }

      setUploading(true);
      try {
        const target = await createUpload.mutateAsync({
          conversationId: activeConversationId,
          fileName: file.name,
          mimeType: file.type as never,
          byteSize: file.size,
        });

        // Straight to storage. With STORAGE_DRIVER=s3 this leaves the app
        // entirely; with the local driver it hits the signed upload endpoint.
        const put = await fetch(target.uploadUrl, {
          method: "PUT",
          headers: target.headers,
          body: file,
        });
        if (!put.ok) throw new Error("The upload failed. Please try again.");

        await completeUpload.mutateAsync({ attachmentId: target.attachmentId });

        // Sent over tRPC rather than the socket, because only this path can
        // carry an attachment id; the server fans the message out either way.
        await sendWithAttachment.mutateAsync({
          conversationId: activeConversationId,
          content: messageInput.trim(),
          attachmentIds: [target.attachmentId],
          replyToId: replyingTo?.id,
        });

        setMessageInput("");
        setReplyingTo(null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The upload failed.");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [
      activeConversationId,
      createUpload,
      completeUpload,
      sendWithAttachment,
      messageInput,
      replyingTo,
    ]
  );
  const afterGroupChange = (message: string) => () => {
    toast.success(message);
    utils.conversation.getById.invalidate();
    refetchConversations();
  };
  const onGroupError = (error: { message: string }) => toast.error(error.message);

  const renameGroup = trpc.conversation.rename.useMutation({
    onSuccess: () => {
      setGroupDialogOpen(false);
      afterGroupChange("Group renamed")();
    },
    onError: onGroupError,
  });
  const addParticipants = trpc.conversation.addParticipants.useMutation({
    onSuccess: afterGroupChange("Member added"),
    onError: onGroupError,
  });
  const removeParticipant = trpc.conversation.removeParticipant.useMutation({
    onSuccess: afterGroupChange("Member removed"),
    onError: onGroupError,
  });
  const transferOwnership = trpc.conversation.transferOwnership.useMutation({
    onSuccess: afterGroupChange("Ownership transferred"),
    onError: onGroupError,
  });
  const leaveGroup = trpc.conversation.leave.useMutation({
    onSuccess: () => {
      setGroupDialogOpen(false);
      toast.success("You left the group");
      setSearchParams({});
      refetchConversations();
    },
    onError: onGroupError,
  });

  const react = trpc.message.react.useMutation({
    onSuccess: () => refetchMessages(),
    onError: (error) => toast.error(error.message),
  });

  const deleteMessage = trpc.message.delete.useMutation({
    onSuccess: () => {
      setPendingDeleteId(null);
      refetchMessages();
      refetchConversations();
    },
    onError: (error) => {
      setPendingDeleteId(null);
      toast.error(error.message);
    },
  });

  const startEditing = (id: number, content: string) => {
    setEditingMessageId(id);
    setEditDraft(content);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditDraft("");
  };

  const submitEdit = () => {
    const content = editDraft.trim();
    if (!editingMessageId) return;
    if (!content) {
      toast.error("A message cannot be empty. Delete it instead.");
      return;
    }
    editMessage.mutate({ messageId: editingMessageId, content });
  };

  // Join socket room for active conversation
  useEffect(() => {
    if (activeConversationId && user) {
      socket.joinConversation(activeConversationId);
      socket.join(user.id);
      return () => {
        socket.leaveConversation(activeConversationId);
      };
    }
  }, [activeConversationId, user, socket]);

  // Listen for new messages
  useEffect(() => {
    const cleanup = socket.onNewMessage((message) => {
      // P-UX-2. The echo is the acknowledgement: a replay the server had
      // already applied is removed rather than sent again.
      if (message.tempId) outboxRef.current.acknowledge(message.tempId);

      if (message.conversationId === activeConversationId) {
        refetchMessages();
        if (message.senderId !== user?.id) {
          // The DOM changes silently for a screen reader user, so say it.
          setAnnouncement(
            t("live.newMessageFrom", conversations?.find((c) => c.id === message.conversationId)
              ?.participants.find((p) => p.userId === message.senderId)?.userName ?? "someone")
          );
          // Two writes, two purposes: the receipt drives the sender's read
          // ticks, the read marker drives our own unread badge.
          socket.markAsRead([message.id], message.conversationId);
          markActiveConversationRead();
        }
      }
      refetchConversations();
    });
    return cleanup;
  }, [
    activeConversationId,
    socket,
    refetchMessages,
    refetchConversations,
    user,
    markActiveConversationRead,
  ]);

  // F-2. Edits and deletes originate on the tRPC path and are fanned out by
  // the server, so an open client converges without polling.
  useEffect(() => {
    const cleanupUpdated = socket.onMessageUpdated((data) => {
      if (data.conversationId === activeConversationId) refetchMessages();
    });
    const cleanupDeleted = socket.onMessageDeleted((data) => {
      if (data.conversationId === activeConversationId) refetchMessages();
      // The sidebar preview may have been that message.
      refetchConversations();
    });
    // S-13. A refused send is silent on the wire; without this the composer
    // clears and the message simply never appears.
    const cleanupRateLimited = socket.socket?.on("rateLimited", (data: { retryAfterMs: number }) => {
      toast.error(
        `You are sending too fast. Try again in ${Math.ceil(data.retryAfterMs / 1000)}s.`
      );
    });
    void cleanupRateLimited;
    // A refusal is final for that message: it must leave the queue, or the
    // next reconnect replays something the server has already said no to.
    socket.socket?.on(
      "messageError",
      (data: { error: string; tempId?: string }) => {
        if (data.tempId) outboxRef.current.fail(data.tempId);
        toast.error(data.error);
      }
    );
    // S-14. Only ever a client bug, so it is logged rather than shown — but it
    // is logged, because silence here is how a shape mismatch survives a
    // release.
    socket.socket?.on("invalidPayload", (data: { event: string; message: string }) => {
      console.error(`Server rejected "${data.event}": ${data.message}`);
    });
    const cleanupReaction = socket.onReactionUpdated((data) => {
      if (data.conversationId === activeConversationId) refetchMessages();
    });
    return () => {
      cleanupUpdated();
      cleanupDeleted();
      cleanupReaction();
      socket.socket?.off("rateLimited");
      socket.socket?.off("invalidPayload");
      socket.socket?.off("messageError");
    };
  }, [activeConversationId, socket, refetchMessages, refetchConversations]);

  // Listen for conversation updates
  useEffect(() => {
    const cleanup = socket.onConversationUpdated(() => {
      refetchConversations();
    });
    return cleanup;
  }, [socket, refetchConversations]);

  // Listen for typing indicators
  useEffect(() => {
    const cleanup = socket.onUserTyping((data) => {
      if (data.conversationId === activeConversationId) {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          if (data.isTyping) {
            next.add(data.userId);
          } else {
            next.delete(data.userId);
          }
          return next;
        });
      }
    });
    return cleanup;
  }, [activeConversationId, socket]);

  // Listen for online users
  useEffect(() => {
    const cleanup1 = socket.onOnlineUsers((userIds) => {
      setOnlineUsers(new Set(userIds));
    });
    const cleanup2 = socket.onUserOnline(({ userId }) => {
      setOnlineUsers((prev) => new Set(prev).add(userId));
    });
    const cleanup3 = socket.onUserOffline(({ userId }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    });
    return () => {
      cleanup1();
      cleanup2();
      cleanup3();
    };
  }, [socket]);

  // Scroll to bottom when the newest message changes, not when an older page
  // is prepended — otherwise "Load older" would jump the member back down.
  const newestMessageId = messages?.[messages.length - 1]?.id;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [newestMessageId, activeConversationId]);

  // ── P-UX-4 · going to a message ─────────────────────────────────────────
  // A jump is queued rather than performed, because the target is often in a
  // conversation that is not open yet: `selectConversation` changes the query
  // key, and the messages arrive a round trip later. The effect below fires
  // once they do — and, being declared after the scroll-to-bottom effect
  // above, its scroll is the one that lands.
  const [pendingJumpId, setPendingJumpId] = useState<number | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pendingJumpId === null || !messages) return;

    const node = document.querySelector<HTMLElement>(
      `[data-message-id="${pendingJumpId}"]`
    );
    setPendingJumpId(null);

    if (!node) {
      // A hit outside the pages loaded so far is not in the DOM yet. Saying
      // so beats a click that appears to do nothing; Load older can reach it.
      toast.info(t("media.messageNotLoaded"));
      return;
    }

    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(pendingJumpId);

    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(
      () => setHighlightedMessageId(null),
      JUMP_HIGHLIGHT_MS
    );
  }, [pendingJumpId, messages]);

  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    []
  );

  // Handle mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const handleSendMessage = useCallback(() => {
    const content = messageInput.trim();
    if (!content || !activeConversationId) return;

    // P-UX-3. The cap belongs to the server, but sending something it will
    // certainly reject only to surface the rejection as a failed send is a
    // worse answer than declining here, next to the counter that says why.
    if (content.length > MAX_MESSAGE_LENGTH) {
      toast.error(t("composer.tooLong", MAX_MESSAGE_LENGTH));
      return;
    }

    // P-UX-2. Everything goes through the outbox, connected or not — so the
    // send path is one path, and "sent" always means "the server echoed the
    // tempId back". Previously an emit into a dead socket looked identical to
    // a successful one and the message was simply lost.
    const entry = outboxRef.current.enqueue({
      conversationId: activeConversationId,
      content,
      replyToId: replyingTo?.id,
    });

    if (socket.isConnected) {
      socket.sendMessage({
        conversationId: activeConversationId,
        content,
        type: "text",
        replyToId: replyingTo?.id,
        tempId: entry.tempId,
      });
    }

    setMessageInput("");
    setReplyingTo(null);
  }, [messageInput, activeConversationId, socket, replyingTo]);

  // Replay on reconnect, oldest first, and tell the member about anything the
  // queue gave up on rather than dropping it in silence.
  useEffect(() => {
    if (!socket.isConnected) return;

    const dropped = outboxRef.current.drain();
    for (const entry of dropped) {
      toast.error(`Could not send "${entry.content.slice(0, 40)}". Please try again.`);
    }

    for (const entry of outboxRef.current.takeForReplay()) {
      socket.sendMessage({
        conversationId: entry.conversationId,
        content: entry.content,
        type: "text",
        replyToId: entry.replyToId,
        tempId: entry.tempId,
      });
    }
  }, [socket.isConnected, socket]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  const handleTyping = useCallback(
    (value: string) => {
      setMessageInput(value);
      if (activeConversationId) {
        socket.setTyping(activeConversationId, value.length > 0);
      }
    },
    [activeConversationId, socket]
  );

  // ── P-UX-3 · the composer ───────────────────────────────────────────────
  // The cap was enforced only by the server, so the first a member heard of it
  // was a rejection after they had finished writing.
  const counter = counterState(messageInput.length);

  /** Insert an emoji where the caret is, then put the caret after it. */
  const insertEmoji = useCallback((emoji: string) => {
    const field = composerRef.current;
    const next = insertAtCaret(
      messageInput,
      field?.selectionStart ?? null,
      field?.selectionEnd ?? null,
      emoji
    );

    setMessageInput(next.value);

    // Focus returns to the message, not the picker's trigger — otherwise
    // inserting two emoji in a row means reaching for the mouse between them.
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(next.caret, next.caret);
    });
  }, [messageInput]);

  /**
   * A pasted image goes straight into F-4's upload path. A paste with no files
   * is left entirely alone, so pasting text still behaves like pasting text.
   */
  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const files = filesFromClipboard(event.clipboardData);
      if (files.length === 0) return;

      event.preventDefault();
      void handleFilesSelected(files);
    },
    [handleFilesSelected]
  );

  // Shift+Enter inserts a newline; a fixed-height box hides it. Grow to fit,
  // up to the same ceiling the stylesheet sets, then let it scroll.
  useEffect(() => {
    const field = composerRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [messageInput]);

  const selectConversation = (id: number) => {
    setSearchParams({ c: id.toString() });
    const opened = conversations?.find((c) => c.id === id);
    setAnnouncement(t("live.conversationOpened", opened?.displayName ?? ""));
    // A reply target belongs to the conversation it came from; carrying it
    // across would be rejected by the server (FR-MSG-15) and confusing here.
    setReplyingTo(null);
    setEditingMessageId(null);
    if (isMobile) setSidebarOpen(false);
  };

  /** Open the conversation a message lives in, then go to the message. */
  const jumpToMessage = (messageId: number, conversationId?: number) => {
    if (conversationId !== undefined && conversationId !== activeConversationId) {
      selectConversation(conversationId);
    }
    setPendingJumpId(messageId);
  };

  const filteredConversations = conversations?.filter((conv) =>
    conversationMatchesQuery(conv.displayName, searchQuery)
  );

  const isUserOnline = (userId: number) => onlineUsers.has(userId);

  // F-8. Blocking is a person-to-person act, so it is only offered on a direct
  // conversation — there is no single "other member" of a group to block.
  const otherMemberId = otherDirectMemberId(
    activeConversation?.type,
    activeConversation?.participants,
    user?.id,
  );
  const isOtherMemberBlocked =
    otherMemberId !== null &&
    (blockedContacts ?? []).some((b) => b.contactUserId === otherMemberId);

  const isGroup = activeConversation?.type === "group";
  const isGroupOwner = callerIsGroupOwner(
    activeConversation?.type,
    activeConversation?.createdBy,
    user?.id,
  );
  const contactsNotInGroup = contactsNotInConversation(
    contacts ?? [],
    activeConversation?.participants,
  );

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <LiveRegion message={announcement} />
      <ConversationSidebar
        sidebarOpen={sidebarOpen}
        isMobile={isMobile}
        onlineCount={onlineUsers.size}
        searchQuery={searchQuery}
        conversations={filteredConversations}
        activeConversationId={activeConversationId}
        selfId={user?.id}
        isUserOnline={isUserOnline}
        push={push}
        onCloseSidebar={() => setSidebarOpen(false)}
        onSearchQueryChange={setSearchQuery}
        onSelectConversation={selectConversation}
        onOpenContacts={() => navigate("/contacts")}
        onOpenSettings={() => navigate("/settings")}
        onLogout={logout}
      />

      {/* Chat Area */}
      <main className="flex-1 flex flex-col h-full bg-background/50">
        {activeConversation && activeConversationId ? (
          <>
            {/* Chat Header */}
            <header className="flex items-center gap-4 px-4 py-3 border-b border-border bg-card/30 backdrop-blur-sm">
              {isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("a11y.openSidebar")}
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu className="w-5 h-5" />
                </Button>
              )}
              <div className="relative">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={activeConversation.displayAvatar || undefined} />
                  <AvatarFallback className="bg-primary/20 text-primary">
                    {avatarInitial(activeConversation.displayName, "")}
                  </AvatarFallback>
                </Avatar>
                {activeConversation.type === "direct" &&
                  activeConversation.participants.find(
                    (p) => p.userId !== user?.id && isUserOnline(p.userId)
                  ) && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-background rounded-full" />
                  )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-sm truncate">
                  {activeConversation.displayName}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {activeConversation.type === "direct"
                    ? activeConversation.participants.find(
                        (p) =>
                          p.userId !== user?.id && isUserOnline(p.userId)
                      )
                      ? t("status.online")
                      : t("status.offline")
                    : t("count.members", activeConversation.participants.length)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {/*
                  The phone and video icons that used to sit beside this did
                  nothing when pressed, so S-20 removed them rather than label
                  a control that lies. They return with P-CALL-1/2. Search is
                  live as of P-SEARCH-1.
                */}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("a11y.searchMessages")}
                  aria-expanded={searchOpen}
                  onClick={() => {
                    setSearchOpen((open) => !open);
                    setMessageQuery("");
                  }}
                >
                  <Search className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("a11y.openMedia")}
                  onClick={() => setMediaOpen(true)}
                >
                  <Images className="w-4 h-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("a11y.conversationMenu")}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {/*
                      P-UX-1. Mute is a real preference now: all, mentions, or
                      off for this conversation only.
                    */}
                    <DropdownMenuItem
                      disabled={setNotifyLevel.isPending}
                      onClick={() =>
                        setNotifyLevel.mutate({
                          conversationId: activeConversation.id,
                          level: "all",
                        })
                      }
                    >
                      {activeConversation.notifyLevel === "all" ? "✓ " : ""}All messages
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={setNotifyLevel.isPending}
                      onClick={() =>
                        setNotifyLevel.mutate({
                          conversationId: activeConversation.id,
                          level: "mentions",
                        })
                      }
                    >
                      {activeConversation.notifyLevel === "mentions" ? "✓ " : ""}Mentions only
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={setNotifyLevel.isPending}
                      onClick={() =>
                        setNotifyLevel.mutate({
                          conversationId: activeConversation.id,
                          level: "off",
                        })
                      }
                    >
                      {activeConversation.notifyLevel === "off" ? "✓ " : ""}Notifications off
                    </DropdownMenuItem>
                    {isGroup && (
                      <DropdownMenuItem
                        onClick={() => {
                          setGroupNameDraft(activeConversation?.name ?? "");
                          setGroupDialogOpen(true);
                        }}
                        className="gap-2"
                      >
                        <Users className="w-4 h-4" />
                        Group settings
                      </DropdownMenuItem>
                    )}
                    {otherMemberId !== null &&
                      (isOtherMemberBlocked ? (
                        <DropdownMenuItem
                          onClick={() =>
                            unblockUser.mutate({ contactUserId: otherMemberId })
                          }
                          disabled={unblockUser.isPending}
                        >
                          {unblockUser.isPending ? "Unblocking…" : "Unblock"}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() =>
                            blockUser.mutate({ contactUserId: otherMemberId })
                          }
                          disabled={blockUser.isPending}
                        >
                          {blockUser.isPending ? "Blocking…" : "Block user"}
                        </DropdownMenuItem>
                      ))}
                    <DropdownMenuItem
                      onClick={() => navigate("/contacts")}
                      className="gap-2"
                    >
                      <Users className="w-4 h-4" />
                      Manage contacts
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>

            {/* Messages Area */}
            <ConnectionBanner
              state={socket.connection}
              queued={outboxRef.current.size()}
            />

            {searchOpen && (
              <div className="border-b border-border bg-card/30 px-4 py-3 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={messageQuery}
                      onChange={(e) => setMessageQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setSearchOpen(false);
                      }}
                      placeholder={
                        searchEverywhere
                          ? t("search.placeholderGlobal")
                          : t("search.placeholderConversation")
                      }
                      aria-label={t("a11y.searchMessages")}
                      className="pl-9 bg-secondary/50 border-0"
                      autoFocus
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("a11y.closeSearch")}
                    onClick={() => setSearchOpen(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  {/*
                    P-SEARCH-2. The same query, two scopes. `aria-pressed`
                    rather than two links, because this toggles the scope of
                    what is already on screen.
                  */}
                  {[false, true].map((everywhere) => (
                    <button
                      key={String(everywhere)}
                      onClick={() => setSearchEverywhere(everywhere)}
                      aria-pressed={searchEverywhere === everywhere}
                      className={`px-2 py-1 rounded-md transition-colors ${
                        searchEverywhere === everywhere
                          ? "bg-primary/20 text-primary"
                          : "text-muted-foreground hover:bg-secondary/60"
                      }`}
                    >
                      {everywhere
                        ? t("search.scopeEverywhere")
                        : t("search.scopeThisConversation")}
                    </button>
                  ))}
                  {messageQueryIsSearchable && messageSearch.isSuccess && (
                    <span className="ml-auto text-muted-foreground" role="status">
                      {t("search.resultCount", messageSearch.data.length)}
                    </span>
                  )}
                </div>

                <ScrollArea className="max-h-64">
                  {!messageQueryIsSearchable ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      {t("search.prompt", MIN_SEARCH_QUERY_LENGTH)}
                    </p>
                  ) : messageSearch.isPending ? (
                    <div className="py-4 text-center">
                      <Spinner className="w-5 h-5 mx-auto" />
                    </div>
                  ) : messageSearch.isError ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      {messageSearch.error.message}
                    </p>
                  ) : messageSearch.data.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      {t("search.noResults")}
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {messageSearch.data.map((result) => (
                        <li key={result.id}>
                          <button
                            onClick={() => {
                              // P-UX-4. Previously this opened the
                              // conversation and left the member to find the
                              // message they had just searched for.
                              jumpToMessage(result.id, result.conversationId);
                              setSearchOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-secondary/60 transition-colors"
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xs font-medium truncate">
                                {result.senderName || "Unknown"}
                                {searchEverywhere && (
                                  <span className="text-muted-foreground font-normal">
                                    {" · "}
                                    {result.conversationType === "group"
                                      ? result.conversationName || "Group"
                                      : "Direct"}
                                  </span>
                                )}
                              </span>
                              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                {formatMessageTimestamp(result.createdAt)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {result.content}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </div>
            )}

            <MessageThread
              messages={messages}
              highlightedMessageId={highlightedMessageId}
              editingMessageId={editingMessageId}
              editDraft={editDraft}
              editPending={editMessage.isPending}
              pendingDeleteId={pendingDeleteId}
              selfId={user?.id}
              pending={pending}
              activeConversationId={activeConversationId}
              socketConnected={socket.isConnected}
              showTyping={typingUsers.size > 0}
              messagesEndRef={messagesEndRef}
              onEditDraftChange={setEditDraft}
              onSubmitEdit={submitEdit}
              onCancelEdit={cancelEditing}
              onReply={(msg) =>
                setReplyingTo({
                  id: msg.id,
                  content: msg.content,
                  senderName: msg.isMine ? "You" : msg.senderName,
                })
              }
              onReact={(messageId, emoji) => react.mutate({ messageId, emoji })}
              onStartEdit={startEditing}
              onDelete={(messageId) => {
                setPendingDeleteId(messageId);
                deleteMessage.mutate({ messageId });
              }}
              hasOlder={Boolean(hasNextPage)}
              loadingOlder={isFetchingNextPage}
              onLoadOlder={() => {
                void fetchNextPage();
              }}
            />

            {/* F-7 · Group settings */}
            <GroupSettingsDialog
              open={groupDialogOpen}
              onOpenChange={setGroupDialogOpen}
              conversationId={activeConversationId}
              groupName={activeConversation?.name ?? null}
              nameDraft={groupNameDraft}
              onNameDraftChange={setGroupNameDraft}
              isOwner={isGroupOwner}
              ownerId={activeConversation?.createdBy ?? null}
              selfId={user?.id}
              members={activeConversation?.participants ?? []}
              contactsNotInGroup={contactsNotInGroup}
              renamePending={renameGroup.isPending}
              addPending={addParticipants.isPending}
              removePending={removeParticipant.isPending}
              transferPending={transferOwnership.isPending}
              leavePending={leaveGroup.isPending}
              onRename={(name) =>
                activeConversationId &&
                renameGroup.mutate({ conversationId: activeConversationId, name })
              }
              onAdd={(userId) =>
                activeConversationId &&
                addParticipants.mutate({
                  conversationId: activeConversationId,
                  userIds: [userId],
                })
              }
              onRemove={(userId) =>
                activeConversationId &&
                removeParticipant.mutate({
                  conversationId: activeConversationId,
                  userId,
                })
              }
              onTransfer={(userId) =>
                activeConversationId &&
                transferOwnership.mutate({
                  conversationId: activeConversationId,
                  newOwnerId: userId,
                })
              }
              onLeave={() =>
                activeConversationId &&
                leaveGroup.mutate({ conversationId: activeConversationId })
              }
            />

            {activeConversationId !== null && (
              <MediaDrawer
                conversationId={activeConversationId}
                open={mediaOpen}
                onOpenChange={setMediaOpen}
                onJumpToMessage={(messageId) => jumpToMessage(messageId)}
              />
            )}

            <MessageComposer
              messageInput={messageInput}
              replyingTo={replyingTo}
              uploading={uploading}
              counter={counter}
              fileInputRef={fileInputRef}
              composerRef={composerRef}
              onMessageInput={handleTyping}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              onCancelReply={() => setReplyingTo(null)}
              onFilesSelected={handleFilesSelected}
              onInsertEmoji={insertEmoji}
              onSend={handleSendMessage}
            />

          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm px-4">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto mb-6">
                <MessageCircle className="w-10 h-10 text-primary/70" />
              </div>
              <h2 className="text-xl font-bold mb-2">
                Welcome to Alice Chains
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Select a conversation from the sidebar or add contacts to start
                messaging.
              </p>
              <Button
                onClick={() => navigate("/contacts")}
                className="gap-2"
              >
                <Users className="w-4 h-4" />
                Go to Contacts
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
