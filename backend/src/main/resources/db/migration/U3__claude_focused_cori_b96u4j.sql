-- Manual revert for V3. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops the lists of boards that users opened through links; they are not restored.

DROP INDEX board_visits_board_id_idx;

DROP INDEX board_visits_user_id_visited_at_idx;

DROP TABLE board_visits;

DELETE FROM flyway_schema_history WHERE version = '3';
