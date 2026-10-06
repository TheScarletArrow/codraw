-- Manual revert for V14. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops when users were on boards; they are not restored. The next visit of every user is like a first one.

DROP INDEX board_reads_board_id_idx;

DROP TABLE board_reads;

DELETE FROM flyway_schema_history WHERE version = '14';
