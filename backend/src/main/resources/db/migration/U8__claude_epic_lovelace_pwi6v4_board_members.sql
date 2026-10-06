-- Manual revert for V8. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops the members and the invitation links of all boards; they are not restored. The boards stay with their
-- owners and their link access.

DROP INDEX board_invites_board_id_created_at_idx;

DROP TABLE board_invites;

DROP INDEX board_members_user_id_idx;

DROP TABLE board_members;

DELETE FROM flyway_schema_history WHERE version = '8';
