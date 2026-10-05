-- Manual revert for V4. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops the link access of boards; every board becomes editable through its link again.

ALTER TABLE boards DROP COLUMN link_access;

DELETE FROM flyway_schema_history WHERE version = '4';
