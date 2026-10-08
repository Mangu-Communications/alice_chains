-- P4-003. Soft-delete cleanup scans tombstones by deletedAt.
-- The job clears leftover bodies and attachment bytes. The row stays.
ALTER TABLE `messages`
  ADD INDEX `messages_deleted_at_idx` (`deletedAt`);
