-- A1-004. Remember a decline so a later @alice does not open another card
-- (MASTER §7.3–§7.4). No foreign keys: same pattern as alice_cost_daily.
-- The decision sentence on the admission card is the visible record.
CREATE TABLE `alice_declines` (
  `conversationId` bigint unsigned NOT NULL,
  `declinedBy` bigint unsigned NOT NULL,
  `declinedAt` timestamp(3) NOT NULL DEFAULT (now(3)),
  CONSTRAINT `alice_declines_conversationId` PRIMARY KEY(`conversationId`)
);
