-- Manual revert for V11. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops the points of all threads; they are not restored. The threads at points stay, with their comments, as
-- threads about their pages.

ALTER TABLE comment_threads
    DROP CONSTRAINT comment_threads_point_range_check,
    DROP CONSTRAINT comment_threads_point_cell_id_check,
    DROP CONSTRAINT comment_threads_point_check,
    DROP COLUMN y,
    DROP COLUMN x;

DELETE FROM flyway_schema_history WHERE version = '11';
