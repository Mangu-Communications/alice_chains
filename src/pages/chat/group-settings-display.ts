/**
 * S-0 slice 5 — display decisions that used to sit inline in the group
 * settings dialog of `src/pages/Chat.tsx`.
 *
 * The page still owns the draft, the mutations, and when the dialog opens.
 * These helpers only decide which buttons are enabled, so a later slice
 * cannot quietly change the owner-only rename or the leave hint.
 */

export function renameSaveDisabled(
  isOwner: boolean,
  pending: boolean,
  draft: string,
  currentName: string | null | undefined,
): boolean {
  const next = draft.trim();
  return !isOwner || pending || !next || next === currentName;
}

export function showLeaveTransferHint(isOwner: boolean, memberCount: number): boolean {
  return isOwner && memberCount > 1;
}

export function memberCountLabel(memberCount: number): string {
  return `Members (${memberCount})`;
}

export type AliceSettingsAction = "remove" | "reinvite" | "none";

/** A1-005. Remove while she is a member; re-invite only after a remembered decline. */
export function aliceSettingsAction(input: {
  canManage: boolean;
  aliceInGroup: boolean;
  aliceDeclined: boolean;
}): AliceSettingsAction {
  if (!input.canManage) return "none";
  if (input.aliceInGroup) return "remove";
  if (input.aliceDeclined) return "reinvite";
  return "none";
}
