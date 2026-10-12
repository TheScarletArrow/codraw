-- Manual revert for V32. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: the days of activity of users and boards and the counts of guests who signed in are lost; the statistics of
-- the installation start from nothing again.

DROP TABLE product_daily_counts;

DROP INDEX board_activity_days_by_day;
DROP TABLE board_activity_days;

DROP INDEX user_activity_days_by_day;
DROP TABLE user_activity_days;

DELETE FROM flyway_schema_history WHERE version = '32';
