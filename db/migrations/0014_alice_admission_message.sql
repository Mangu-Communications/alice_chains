-- A1-003. Admission cards are system messages from the Alice user (MASTER §7.4).
-- Human send paths stay text|image|file. This value is server-inserted only.
ALTER TABLE `messages` MODIFY `type` enum('text','image','file','system') NOT NULL DEFAULT 'text';
