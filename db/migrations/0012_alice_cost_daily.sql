-- A1-001. Daily Alice spend per MASTER.md §7.12.
-- scopeId is NULL for instance scope. MySQL unique indexes do not collapse
-- NULLs, so the write path updates an existing instance row by id.
CREATE TABLE `alice_cost_daily` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `scope` enum('instance','conversation') NOT NULL,
  `scopeId` bigint unsigned,
  `inputTokens` int unsigned NOT NULL DEFAULT 0,
  `outputTokens` int unsigned NOT NULL DEFAULT 0,
  `costUSD` decimal(10,6) NOT NULL DEFAULT 0,
  `updatedAt` timestamp(3) NOT NULL DEFAULT (now(3)) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `alice_cost_daily_id` PRIMARY KEY(`id`),
  CONSTRAINT `alice_cost_daily_scope_date_uq` UNIQUE(`scope`,`scopeId`,`date`)
);
