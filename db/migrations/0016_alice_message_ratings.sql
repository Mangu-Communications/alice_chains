-- A1-014. One thumbs up/down per member per Alice message.
-- No foreign keys: same pattern as alice_cost_daily and alice_declines.
-- A second tap of the same thumb deletes the row (toggle).
CREATE TABLE `alice_message_ratings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `messageId` bigint unsigned NOT NULL,
  `userId` bigint unsigned NOT NULL,
  `rating` enum('up','down') NOT NULL,
  `createdAt` timestamp(3) NOT NULL DEFAULT (now(3)),
  CONSTRAINT `alice_message_ratings_id` PRIMARY KEY(`id`),
  CONSTRAINT `alice_message_ratings_msg_user_uq` UNIQUE(`messageId`,`userId`)
);
