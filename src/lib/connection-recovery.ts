/**
 * P4-001. A dropped socket should resume the open conversation.
 *
 * The server keeps the Socket.IO session for this long (see api/socket.ts).
 * The client still rejoins the open room on every connect: recovery restores
 * rooms only when the session is still there.
 */
export const CONNECTION_RECOVERY_MS = 2 * 60 * 1000;

export function shouldRejoinOpenConversation(activeConversationId: number | null): boolean {
  return activeConversationId != null;
}

/**
 * Missed packets are replayed only when Socket.IO restores the session.
 * The first connect is not a drop. A later connect that did not recover
 * must refetch the open thread.
 */
export function shouldRefetchOpenThread(input: {
  connectionEpoch: number;
  recovered: boolean;
}): boolean {
  return input.connectionEpoch > 1 && !input.recovered;
}
