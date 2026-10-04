-- Manual revert for V4. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops the access modes of boards; afterwards every link gives editing again, also to closed boards.

ALTER TABLE boards DROP COLUMN link_access;

DELETE FROM flyway_schema_history WHERE version = '4';
