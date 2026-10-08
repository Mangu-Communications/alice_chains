-- P4-005. Daily session prune scans absolute expiry, idle expiry, and revocation.
-- MASTER IX-4 names expiresAt; this table has no such column. Absolute expiry
-- is createdAt plus the 7-day maximum. Not the account purge.
ALTER TABLE `sessions`
  ADD INDEX `sessions_created_at_idx` (`createdAt`),
  ADD INDEX `sessions_last_seen_at_idx` (`lastSeenAt`),
  ADD INDEX `sessions_revoked_at_idx` (`revokedAt`);
