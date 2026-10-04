-- Manual revert for V2. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops all users and sessions and the owners of boards. Boards deleted by V2 are not restored.

DROP INDEX boards_owner_id_updated_at_idx;

CREATE INDEX boards_updated_at_idx ON boards (updated_at DESC);

ALTER TABLE boards DROP COLUMN owner_id;

DROP TABLE spring_session_attributes;

DROP TABLE spring_session;

DROP TABLE users;

DELETE FROM flyway_schema_history WHERE version = '2';
