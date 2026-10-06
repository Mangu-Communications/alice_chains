/**
 * S-0 slice 5 — group settings dialog, presentational only.
 *
 * Chat.tsx still owns the name draft, the conversation mutations, and
 * when the dialog opens. This component renders the same dialog the page
 * used to render inline.
 */
import { useRef } from "react";
import { LogOut, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/i18n";
import { avatarInitial } from "@/lib/chat-display";
import {
  memberCountLabel,
  renameSaveDisabled,
  showLeaveTransferHint,
} from "./group-settings-display";

export type GroupSettingsMember = {
  userId: number;
  userName: string | null;
  userAvatar: string | null;
};

export type GroupSettingsContact = {
  contactUserId: number;
  contactName: string | null;
};

export type GroupSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: number | null;
  groupName: string | null;
  nameDraft: string;
  onNameDraftChange: (value: string) => void;
  isOwner: boolean;
  ownerId: number | null;
  selfId: number | undefined;
  members: GroupSettingsMember[];
  contactsNotInGroup: GroupSettingsContact[];
  renamePending: boolean;
  addPending: boolean;
  removePending: boolean;
  transferPending: boolean;
  leavePending: boolean;
  onRename: (name: string) => void;
  onAdd: (userId: number) => void;
  onRemove: (userId: number) => void;
  onTransfer: (userId: number) => void;
  onLeave: () => void;
};

export function GroupSettingsDialog({
  open,
  onOpenChange,
  conversationId,
  groupName,
  nameDraft,
  onNameDraftChange,
  isOwner,
  ownerId,
  selfId,
  members,
  contactsNotInGroup,
  renamePending,
  addPending,
  removePending,
  transferPending,
  leavePending,
  onRename,
  onAdd,
  onRemove,
  onTransfer,
  onLeave,
}: GroupSettingsDialogProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(event) => {
          // Opening from a menu item unmounts the trigger, so focus would land on body.
          event.preventDefault();
          nameInputRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Group settings</DialogTitle>
          <DialogDescription>
            Change the name, members, or leave. Escape closes this dialog.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="group-name" className="text-sm font-medium">
              Name
            </label>
            <div className="flex gap-2">
              <Input
                id="group-name"
                ref={nameInputRef}
                value={nameDraft}
                onChange={(e) => onNameDraftChange(e.target.value)}
                maxLength={100}
                disabled={!isOwner}
                placeholder="Group name"
              />
              <Button
                onClick={() => conversationId && onRename(nameDraft.trim())}
                disabled={renameSaveDisabled(isOwner, renamePending, nameDraft, groupName)}
              >
                {renamePending ? "Saving…" : "Save"}
              </Button>
            </div>
            {!isOwner && (
              <p className="text-xs text-muted-foreground">
                Only the group owner can change these.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">{memberCountLabel(members.length)}</p>
            <ScrollArea className="max-h-48">
              <ul className="space-y-1">
                {members.map((p) => (
                  <li
                    key={p.userId}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/50"
                  >
                    <Avatar className="w-7 h-7">
                      <AvatarImage src={p.userAvatar || undefined} />
                      <AvatarFallback className="text-[10px] bg-primary/20">
                        {avatarInitial(p.userName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 text-sm truncate">
                      {p.userName || "Unknown"}
                      {p.userId === ownerId && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          owner
                        </span>
                      )}
                    </span>
                    {isOwner && p.userId !== selfId && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => conversationId && onTransfer(p.userId)}
                          disabled={transferPending}
                        >
                          Make owner
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          aria-label={t("a11y.removeMember", p.userName || "member")}
                          onClick={() => conversationId && onRemove(p.userId)}
                          disabled={removePending}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>

          {isOwner && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Add a contact</p>
              {contactsNotInGroup.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Everyone in your contacts is already here.
                </p>
              ) : (
                <ScrollArea className="max-h-40">
                  <ul className="space-y-1">
                    {contactsNotInGroup.map((c) => (
                      <li
                        key={c.contactUserId}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/50"
                      >
                        <span className="flex-1 text-sm truncate">
                          {c.contactName || "Unknown"}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => conversationId && onAdd(c.contactUserId)}
                          disabled={addPending}
                        >
                          Add
                        </Button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </div>
          )}

          <div className="pt-2 border-t border-border">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-destructive"
              onClick={() => conversationId && onLeave()}
              disabled={leavePending}
            >
              <LogOut className="w-4 h-4" />
              {leavePending ? "Leaving…" : "Leave group"}
            </Button>
            {showLeaveTransferHint(isOwner, members.length) && (
              <p className="text-xs text-muted-foreground px-3">
                Transfer ownership to someone else before you can leave.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
