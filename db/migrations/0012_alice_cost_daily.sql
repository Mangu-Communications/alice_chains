-- A1-001. alice_cost_daily per MASTER.md §7.12.
-- scopeId is NULL for instance scope and the conversation id otherwise.
-- Resets are by UTC date (see §14.7).
CREATE TABLE `alice_cost_daily` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `date` DATE NOT NULL,
  `scope` ENUM('instance','conversation') NOT NULL,
  `scopeId` BIGINT UNSIGNED NULL,
  `inputTokens` INT UNSIGNED NOT NULL DEFAULT 0,
  `outputTokens` INT UNSIGNED NOT NULL DEFAULT 0,
  `costUSD` DECIMAL(10,6) NOT NULL DEFAULT 0,
  `updatedAt` TIMESTAMP(3) NOT NULL DEFAULT NOW(3) ON UPDATE NOW(3),
  UNIQUE KEY `alice_cost_daily_scope_date_uq` (`scope`, `scopeId`, `date`)
);
