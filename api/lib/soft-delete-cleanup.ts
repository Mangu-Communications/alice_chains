/**
 * P4-003. Soft-delete cleanup (MASTER P4, NFR-OPS-06).
 *
 * Delete already blanks `messages.content`. File pointers and attachment bytes
 * can still outlive the tombstone. After the retention window this job clears
 * those leftovers. The row stays so a reply chain keeps its shape.
 *
 * Not account erasure.
 */
import { and, inArray, isNotNull, lt } from "drizzle-orm";
import { attachments, messages } from "@db/schema";
import { getDb } from "../queries/connection";
import { env } from "./env";
import { log } from "./logger";
import { getStorage } from "./storage";

export const DEFAULT_SOFT_DELETE_RETENTION_DAYS = 30;
export const SOFT_DELETE_CLEANUP_BATCH = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

export function readSoftDeleteRetentionDays(
  source: Record<string, string | undefined> | { SOFT_DELETE_RETENTION_DAYS?: string | number } = env,
): number {
  const raw = source.SOFT_DELETE_RETENTION_DAYS;
  if (raw == null || raw === "") return DEFAULT_SOFT_DELETE_RETENTION_DAYS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3650) {
    return DEFAULT_SOFT_DELETE_RETENTION_DAYS;
  }
  return parsed;
}

export function softDeleteCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

export type TombstoneBody = {
  id: number;
  content: string;
  fileUrl: string | null;
};

/** A tombstone still holds a body when text or a file pointer remains. */
export function tombstoneStillHoldsBody(row: TombstoneBody): boolean {
  return row.content !== "" || (row.fileUrl != null && row.fileUrl !== "");
}

export type SoftDeleteCleanupResult = {
  cutoff: string;
  scanned: number;
  bodiesCleared: number;
  attachmentsRemoved: number;
};

export async function cleanupSoftDeletedBodies(
  db: ReturnType<typeof getDb>,
  options: {
    now?: Date;
    retentionDays?: number;
    deleteObject?: (key: string) => Promise<void>;
  } = {},
): Promise<SoftDeleteCleanupResult> {
  const now = options.now ?? new Date();
  const retentionDays = options.retentionDays ?? readSoftDeleteRetentionDays();
  const cutoff = softDeleteCutoff(now, retentionDays);
  const deleteObject = options.deleteObject ?? ((key: string) => getStorage().deleteObject(key));

  const due = await db
    .select({
      id: messages.id,
      content: messages.content,
      fileUrl: messages.fileUrl,
    })
    .from(messages)
    .where(and(isNotNull(messages.deletedAt), lt(messages.deletedAt, cutoff)))
    .limit(SOFT_DELETE_CLEANUP_BATCH);

  const bodyIds = due.filter(tombstoneStillHoldsBody).map((row) => row.id);
  if (bodyIds.length > 0) {
    await db
      .update(messages)
      .set({ content: "", fileUrl: null })
      .where(inArray(messages.id, bodyIds));
  }

  const messageIds = due.map((row) => row.id);
  let attachmentsRemoved = 0;
  if (messageIds.length > 0) {
    const files = await db
      .select({ id: attachments.id, storageKey: attachments.storageKey })
      .from(attachments)
      .where(inArray(attachments.messageId, messageIds));
    for (const file of files) {
      await deleteObject(file.storageKey).catch(() => undefined);
    }
    if (files.length > 0) {
      await db
        .delete(attachments)
        .where(inArray(attachments.id, files.map((file) => file.id)));
      attachmentsRemoved = files.length;
    }
  }

  return {
    cutoff: cutoff.toISOString(),
    scanned: due.length,
    bodiesCleared: bodyIds.length,
    attachmentsRemoved,
  };
}

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

async function runOnce(): Promise<void> {
  try {
    const result = await cleanupSoftDeletedBodies(getDb());
    if (result.bodiesCleared > 0 || result.attachmentsRemoved > 0) {
      log.info("soft_delete_cleanup", result);
    }
  } catch (error) {
    log.warn("soft_delete_cleanup_failed", {
      error: error instanceof Error ? error.message : "cleanup failed",
    });
  }
}

/** Boot sweep. Tests do not start it. Account erasure is a later card. */
export function startSoftDeleteCleanup(intervalMs = CLEANUP_INTERVAL_MS): void {
  if (timer) return;
  void runOnce();
  timer = setInterval(() => {
    void runOnce();
  }, intervalMs);
  timer.unref?.();
}
