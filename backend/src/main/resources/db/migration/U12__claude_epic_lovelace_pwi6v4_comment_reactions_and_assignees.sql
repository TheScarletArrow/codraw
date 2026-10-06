-- Manual revert for V12. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops the reactions to all comments, the assignees of all threads and the notifications of assigned
-- threads; they are not restored. Threads, comments and the other notifications stay.

DROP INDEX notifications_thread_id_idx;

-- The kind check of V10 does not take them.
DELETE FROM notifications WHERE kind = 'ASSIGNED';

ALTER TABLE notifications
    DROP CONSTRAINT notifications_user_id_thread_id_key,
    DROP CONSTRAINT notifications_thread_id_check,
    DROP CONSTRAINT notifications_kind_check,
    ADD CONSTRAINT notifications_kind_check
        CHECK (kind IN ('MENTION', 'REPLY', 'ACCESS_REQUEST', 'ACCESS_GRANTED', 'ACCESS_DECLINED', 'OWNERSHIP')),
    DROP COLUMN thread_id;

DROP INDEX comment_threads_assignee_id_idx;

ALTER TABLE comment_threads DROP COLUMN assignee_id;

DROP INDEX comment_reactions_user_id_idx;

DROP TABLE comment_reactions;

DELETE FROM flyway_schema_history WHERE version = '12';
