-- Manual revert for V10. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops the notifications of all users, read or not; they are not restored. Comments, requests for access,
-- members and boards stay.

DROP INDEX notifications_created_at_idx;

DROP INDEX notifications_actor_id_idx;

DROP INDEX notifications_comment_id_idx;

DROP INDEX notifications_board_id_idx;

DROP INDEX notifications_user_id_id_idx;

DROP TABLE notifications;

DELETE FROM flyway_schema_history WHERE version = '10';
