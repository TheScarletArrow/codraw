-- Manual revert for V26. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: boards shown without a sign-in become viewable through their links by signed-in users only.

ALTER TABLE boards DROP CONSTRAINT boards_link_access_check;
UPDATE boards SET link_access = 'VIEW' WHERE link_access = 'PUBLIC';
ALTER TABLE boards
    ADD CONSTRAINT boards_link_access_check CHECK (link_access IN ('NONE', 'VIEW', 'EDIT'));

DELETE FROM flyway_schema_history WHERE version = '26';
