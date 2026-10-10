-- Manual revert for V28. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: forgets the languages of users; their letters and messages of notifications are in Russian again.

ALTER TABLE users DROP COLUMN language;

DELETE FROM flyway_schema_history WHERE version = '28';
