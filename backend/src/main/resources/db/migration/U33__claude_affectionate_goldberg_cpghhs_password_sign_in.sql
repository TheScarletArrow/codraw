-- Manual revert for V33. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: the passwords of all users are lost; their accounts stay, but nobody signs in to them with a password until
-- the passwords come back, e.g. from a backup.

DROP TABLE password_credentials;

DELETE FROM flyway_schema_history WHERE version = '33';
