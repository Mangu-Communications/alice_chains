-- A1-002. Alice system user per MASTER.md §7.5.
-- INSERT IGNORE is idempotent on users.unionId (unique).
-- Do not invent ALICE_USER_ID. After migrate, the operator sets it from:
--   SELECT id FROM users WHERE unionId = 'alice-v1-system';
INSERT IGNORE INTO users (unionId, name, role, status)
VALUES ('alice-v1-system', 'Alice', 'user', 'I am Alice, an AI assistant.');
