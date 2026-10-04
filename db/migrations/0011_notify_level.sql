ALTER TABLE `conversation_participants` ADD `notifyLevel` enum('all','mentions','off') NOT NULL DEFAULT 'all';
