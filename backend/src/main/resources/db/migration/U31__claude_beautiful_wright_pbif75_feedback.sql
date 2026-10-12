-- Manual revert for V31. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: the feedback of users is lost, and so are the entries of the journal of administrators about closing it.

DELETE FROM admin_actions WHERE action = 'RESOLVE_FEEDBACK' OR target_kind = 'FEEDBACK';
ALTER TABLE admin_actions
    DROP CONSTRAINT admin_actions_target_kind_check,
    ADD CONSTRAINT admin_actions_target_kind_check CHECK (target_kind IN ('USER', 'BOARD')),
    DROP CONSTRAINT admin_actions_action_check,
    ADD CONSTRAINT admin_actions_action_check CHECK (action IN (
        'BLOCK_USER', 'UNBLOCK_USER', 'DELETE_USER', 'BLOCK_SHARING', 'UNBLOCK_SHARING', 'TRASH_BOARD', 'RESOLVE_REPORTS'
    ));

DROP INDEX feedback_resolved_by;
DROP INDEX feedback_user;
DROP INDEX feedback_resolved;
DROP INDEX feedback_open;
DROP TABLE feedback;

DELETE FROM flyway_schema_history WHERE version = '31';
