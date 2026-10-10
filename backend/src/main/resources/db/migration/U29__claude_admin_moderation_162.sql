-- Manual revert for V29. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: the journal of administrators and the reports are lost; blocked users sign in again, and boards whose
-- link an administrator closed keep the link «Только участники», but their owners may open it again.

DROP INDEX admin_actions_by_time;
DROP TABLE admin_actions;

DROP INDEX board_reports_resolved_by;
DROP INDEX board_reports_reporter;
DROP INDEX board_reports_resolved;
DROP INDEX board_reports_open_by_board;
DROP TABLE board_reports;

ALTER TABLE boards DROP COLUMN sharing_blocked_at;

ALTER TABLE users DROP COLUMN blocked_at;

DELETE FROM flyway_schema_history WHERE version = '29';
