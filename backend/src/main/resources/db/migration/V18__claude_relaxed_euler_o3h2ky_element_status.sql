-- A request of a participant to the owner of a board to review an element they marked «Нужно ревью». The status lives in
-- the board document; the notification keeps only the page and the element it is about, as ids of the document like a
-- thread of comments keeps them, never their names, which are read on the board.
ALTER TABLE notifications
    ADD COLUMN page_id text CONSTRAINT notifications_page_id_length_check CHECK (char_length(page_id) BETWEEN 1 AND 100),
    ADD COLUMN cell_id text CONSTRAINT notifications_cell_id_length_check CHECK (char_length(cell_id) BETWEEN 1 AND 100),
    DROP CONSTRAINT notifications_kind_check,
    ADD CONSTRAINT notifications_kind_check
        CHECK (kind IN ('MENTION', 'REPLY', 'ASSIGNED', 'ACCESS_REQUEST', 'ACCESS_GRANTED', 'ACCESS_DECLINED',
                        'OWNERSHIP', 'PROPOSAL_CREATED', 'PROPOSAL_ACCEPTED', 'PROPOSAL_DECLINED', 'REVIEW_REQUEST')),
    ADD CONSTRAINT notifications_page_id_check CHECK ((page_id IS NOT NULL) = (kind = 'REVIEW_REQUEST')),
    ADD CONSTRAINT notifications_cell_id_check CHECK ((cell_id IS NOT NULL) = (kind = 'REVIEW_REQUEST'));

-- How many requests for reviews a user made in the last hour, which the limit of the installation bounds.
CREATE INDEX notifications_review_requests_idx ON notifications (actor_id, created_at) WHERE kind = 'REVIEW_REQUEST';
