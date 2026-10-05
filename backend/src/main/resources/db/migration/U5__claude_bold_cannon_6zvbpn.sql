-- Manual revert for V5. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops the versions of all boards; they are not restored. The documents of the boards stay.

DROP INDEX board_versions_board_id_created_at_idx;

DROP TABLE board_versions;

DELETE FROM flyway_schema_history WHERE version = '5';
