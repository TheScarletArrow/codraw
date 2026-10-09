DROP INDEX boards_trash_by_owner;
ALTER TABLE boards DROP COLUMN deleted_at;
DELETE FROM flyway_schema_history WHERE version = '22';
