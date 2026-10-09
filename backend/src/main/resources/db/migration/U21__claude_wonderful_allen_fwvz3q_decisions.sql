-- Manual revert for V21. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops all decisions of all boards, the elements they name and the threads of comments that discuss them;
-- they are not restored. The boards and the other threads stay.

DELETE FROM comment_threads WHERE decision_id IS NOT NULL;

DROP INDEX comment_threads_decision_id_idx;

ALTER TABLE comment_threads DROP COLUMN decision_id;

DROP TABLE decision_elements;

DROP INDEX decisions_superseded_by_idx;

DROP INDEX decisions_author_id_idx;

DROP TABLE decisions;

DELETE FROM flyway_schema_history WHERE version = '21';
