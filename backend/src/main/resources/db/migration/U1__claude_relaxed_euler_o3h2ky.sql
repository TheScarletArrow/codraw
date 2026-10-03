-- Manual revert for V1. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops all boards and their documents.

DROP TABLE board_documents;

DROP INDEX boards_updated_at_idx;

DROP TABLE boards;

DELETE FROM flyway_schema_history WHERE version = '1';
