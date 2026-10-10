-- Manual revert for V28. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.

DROP INDEX comment_threads_resolved_by_idx;
DELETE FROM flyway_schema_history WHERE version = '28';
