/**
 * S-0 slice 2 — conversation sidebar, presentational only.
 *
 * Chat.tsx still owns the conversation query, search string, selection,
 * and the persisted open/closed preference. This component renders the
 * same aside the page used to render inline.
 */
import {
  Bell,
  BellOff,
  LogOut,
  MessageCircle,
  MoreVertical,
  Search,
  Settings,
  UserPlus,
  Users,
  X,
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
import { t, formatMessageTimestamp } from "@/i18n";
import { avatarInitial } from "@/lib/chat-display";
import {
  conversationPreview,
  directPeerIsOnline,
  unreadBadgeText,
  type SidebarLatestMessage,
} from "./sidebar-display";

export type SidebarConversation = {
  id: number;
  type: string;
  displayName: string | null;
  displayAvatar: string | null | undefined;
  unreadCount: number;
  participants: { userId: number }[];
  latestMessage: (SidebarLatestMessage & { createdAt: Date | string | number }) | null;
};

export type SidebarPush = {
  available: boolean;
  subscribed: boolean;
  busy: boolean;
  permission: string;
  enable: () => void;
  disable: () => void;
};

export type ConversationSidebarProps = {
  sidebarOpen: boolean;
  isMobile: boolean;
  onlineCount: number;
  searchQuery: string;
  conversations: SidebarConversation[] | undefined;
  activeConversationId: number | null;
  selfId: number | undefined;
  isUserOnline: (userId: number) => boolean;
  push: SidebarPush;
  onCloseSidebar: () => void;
  onSearchQueryChange: (query: string) => void;
  onSelectConversation: (id: number) => void;
  onOpenContacts: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
};

export function ConversationSidebar({
  sidebarOpen,
  isMobile,
  onlineCount,
  searchQuery,
  conversations,
  activeConversationId,
  selfId,
  isUserOnline,
  push,
  onCloseSidebar,
  onSearchQueryChange,
  onSelectConversation,
  onOpenContacts,
  onOpenSettings,
  onLogout,
}: ConversationSidebarProps) {
  return (
    <aside
      className={`${
        sidebarOpen || !isMobile
          ? "translate-x-0"
          : "-translate-x-full"
      } ${
        isMobile ? "absolute z-50 w-80" : "w-80 relative"
      } flex-shrink-0 h-full border-r border-border bg-card/50 backdrop-blur-sm transition-transform duration-200 flex flex-col`}
    >
      {/* Sidebar Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/80 to-primary/40 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">Alice Chains</h1>
              <p className="text-xs text-muted-foreground">
                {t("count.onlineNow", onlineCount)}
              </p>
            </div>
          </div>
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("a11y.closeSidebar")}
              onClick={() => onCloseSidebar()}
            >
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            className="pl-9 bg-secondary/50 border-0"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
          />
        </div>
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1">
        {/*
          S-20. A list of buttons, marked up as a list. Without the roles a
          screen reader reads eleven unrelated buttons; with them it says
          "list, eleven items" and offers list navigation. `aria-current`
          is what tells the reader which conversation is open — the visual
          highlight alone says nothing.
        */}
        <div className="p-2 space-y-1" role="list" aria-label="Conversations">
          {conversations?.map((conv) => (
            <button
              key={conv.id}
              role="listitem"
              aria-current={activeConversationId === conv.id ? "true" : undefined}
              onClick={() => onSelectConversation(conv.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-150 text-left group ${
                activeConversationId === conv.id
                  ? "bg-primary/10 border border-primary/20"
                  : "hover:bg-secondary/60 border border-transparent"
              }`}
            >
              <div className="relative flex-shrink-0">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={conv.displayAvatar || undefined} />
                  <AvatarFallback className="bg-primary/20 text-primary">
                    {avatarInitial(conv.displayName)}
                  </AvatarFallback>
                </Avatar>
                {directPeerIsOnline(conv.type, conv.participants, selfId, isUserOnline) && (
                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-background rounded-full" />
                  )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-sm truncate ${
                      conv.unreadCount > 0 ? "font-semibold" : "font-medium"
                    }`}
                  >
                    {conv.displayName}
                  </span>
                  {conv.latestMessage && (
                    <span className="text-[11px] text-muted-foreground flex-shrink-0">
                      {formatMessageTimestamp(conv.latestMessage.createdAt)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p
                    className={`text-xs truncate ${
                      conv.unreadCount > 0
                        ? "text-foreground/80"
                        : "text-muted-foreground"
                    }`}
                  >
                    {conversationPreview(
                        conv.latestMessage,
                        selfId,
                        t("status.noMessagesYet"),
                      )}
                  </p>
                  {conv.unreadCount > 0 && (
                    // A bare number means nothing to a screen reader, so the
                    // visible glyph is hidden from it and the label carries
                    // the meaning.
                    <span
                      className="flex-shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center tabular-nums"
                      aria-label={t("count.unreadMessages", conv.unreadCount)}
                    >
                      <span aria-hidden="true">
                        {unreadBadgeText(conv.unreadCount)}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}

          {conversations?.length === 0 && (
            <div className="text-center py-12 px-4 text-muted-foreground">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
              {searchQuery ? (
                <>
                  <p className="text-sm font-medium">
                    {t("empty.noConversationMatches", searchQuery)}
                  </p>
                  <p className="text-xs mt-1">
                    {t("empty.noConversationMatchesHint")}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3"
                    onClick={() => onSearchQueryChange("")}
                  >
                    {t("action.clearSearch")}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">{t("empty.noConversations")}</p>
                  <p className="text-xs mt-1">{t("empty.noConversationsHint")}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-2"
                    onClick={() => onOpenContacts()}
                  >
                    <UserPlus className="w-4 h-4" />
                    {t("action.addContact")}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 gap-2"
            onClick={() => onOpenContacts()}
          >
            <Users className="w-4 h-4" />
            Contacts
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label={t("a11y.accountMenu")}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => onOpenSettings()}
                className="gap-2"
              >
                <Settings className="w-4 h-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onOpenContacts()}
                className="gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Add Contact
              </DropdownMenuItem>
              {push.available && (
                <DropdownMenuItem
                  onClick={() => (push.subscribed ? push.disable() : push.enable())}
                  disabled={push.busy || push.permission === "denied"}
                  className="gap-2"
                >
                  {push.subscribed ? (
                    <BellOff className="w-4 h-4" />
                  ) : (
                    <Bell className="w-4 h-4" />
                  )}
                  {push.permission === "denied"
                    ? "Notifications blocked"
                    : push.busy
                      ? "Working…"
                      : push.subscribed
                        ? "Turn off notifications"
                        : "Turn on notifications"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onLogout} className="gap-2 text-destructive">
                <LogOut className="w-4 h-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </aside>
  );
}
