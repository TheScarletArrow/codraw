-- Manual revert for V6. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops all comments of all boards and their mentions; they are not restored. The boards stay.

DROP INDEX comment_mentions_user_id_idx;

DROP TABLE comment_mentions;

DROP INDEX comments_author_id_idx;

DROP INDEX comments_thread_id_created_at_idx;

DROP TABLE comments;

DROP INDEX comment_threads_board_id_created_at_idx;

DROP TABLE comment_threads;

DELETE FROM flyway_schema_history WHERE version = '6';
