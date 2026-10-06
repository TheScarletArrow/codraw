-- Manual revert for V9. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops the requests for access to all boards that wait for an answer; they are not restored. Members and
-- boards stay.

DROP INDEX board_access_requests_user_id_idx;

DROP TABLE board_access_requests;

DELETE FROM flyway_schema_history WHERE version = '9';
