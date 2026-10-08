-- P4-002. Outbox idempotency (MASTER G4).
-- A client-generated id, scoped to the sender and conversation, stores one row.
-- NULL stays allowed so system and Alice inserts are not part of the outbox key.
-- MySQL unique indexes permit multiple NULLs.
ALTER TABLE `messages`
  ADD COLUMN `clientMessageId` varchar(64) NULL,
  ADD UNIQUE INDEX `messages_client_message_uq` (`conversationId`, `senderId`, `clientMessageId`);
