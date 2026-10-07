-- Manual revert for V18. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops the notifications about requests for reviews; they are not restored. The statuses of elements stay in
-- the board documents.

DROP INDEX notifications_review_requests_idx;

-- The kind check of V15 does not take them.
DELETE FROM notifications WHERE kind = 'REVIEW_REQUEST';

ALTER TABLE notifications
    DROP CONSTRAINT notifications_cell_id_check,
    DROP CONSTRAINT notifications_page_id_check,
    DROP CONSTRAINT notifications_kind_check,
    ADD CONSTRAINT notifications_kind_check
        CHECK (kind IN ('MENTION', 'REPLY', 'ASSIGNED', 'ACCESS_REQUEST', 'ACCESS_GRANTED', 'ACCESS_DECLINED',
                        'OWNERSHIP', 'PROPOSAL_CREATED', 'PROPOSAL_ACCEPTED', 'PROPOSAL_DECLINED')),
    DROP COLUMN cell_id,
    DROP COLUMN page_id;

DELETE FROM flyway_schema_history WHERE version = '18';
