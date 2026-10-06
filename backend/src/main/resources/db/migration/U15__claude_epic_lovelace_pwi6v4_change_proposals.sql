-- Manual revert for V15. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops all proposals of changes with their drafts and the notifications about them; they are not restored.
-- Versions kept before accepting a proposal stay as versions kept before a restore.

DROP INDEX notifications_proposal_id_idx;

-- The kind check of V12 does not take them.
DELETE FROM notifications WHERE kind IN ('PROPOSAL_CREATED', 'PROPOSAL_ACCEPTED', 'PROPOSAL_DECLINED');

ALTER TABLE notifications
    DROP CONSTRAINT notifications_proposal_id_check,
    DROP CONSTRAINT notifications_kind_check,
    ADD CONSTRAINT notifications_kind_check
        CHECK (kind IN ('MENTION', 'REPLY', 'ASSIGNED', 'ACCESS_REQUEST', 'ACCESS_GRANTED', 'ACCESS_DECLINED', 'OWNERSHIP')),
    DROP COLUMN proposal_id;

UPDATE board_versions SET reason = 'RESTORE' WHERE reason = 'PROPOSAL';

ALTER TABLE board_versions
    DROP CONSTRAINT board_versions_reason_check,
    ADD CONSTRAINT board_versions_reason_check CHECK (reason IN ('AUTO', 'MANUAL', 'RESTORE'));

DROP INDEX proposals_decided_by_idx;

DROP INDEX proposals_author_id_idx;

DROP INDEX proposals_board_id_id_idx;

DROP TABLE proposals;

DELETE FROM flyway_schema_history WHERE version = '15';
