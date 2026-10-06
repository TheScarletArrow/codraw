-- Proposals of changes of boards: a draft of a board that its author edits, which the owner or an editor of the board
-- accepts into it or declines. The base is the stored document of the board when the proposal was made, and the draft
-- starts as the base; both are Yjs states, as opaque to the backend as the documents of boards. NULL is an empty
-- document: the board had no stored state yet.
CREATE TABLE proposals (
    -- uuidv7 grows with the time of the insert: lists go newest first by id.
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    board_id    uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    -- Nobody edits or withdraws a proposal without its author: a guest who is gone takes theirs along.
    author_id   uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title       text        NOT NULL CONSTRAINT proposals_title_check CHECK (char_length(title) BETWEEN 1 AND 120),
    description text        CONSTRAINT proposals_description_check CHECK (char_length(description) BETWEEN 1 AND 2000),
    status      text        NOT NULL DEFAULT 'OPEN'
        CONSTRAINT proposals_status_check CHECK (status IN ('OPEN', 'ACCEPTED', 'DECLINED', 'WITHDRAWN')),
    base        bytea,
    -- Collab stores it while the proposal is open; it does not change once the proposal is closed.
    draft       bytea,
    created_at  timestamptz NOT NULL,
    decided_at  timestamptz,
    -- Who accepted, declined or withdrew it; NULL once they are deleted.
    decided_by  uuid        REFERENCES users (id) ON DELETE SET NULL,
    -- What the owner or an editor wrote to the author when declining it.
    comment     text        CONSTRAINT proposals_comment_check CHECK (char_length(comment) BETWEEN 1 AND 2000),
    CONSTRAINT proposals_decided_at_check CHECK ((status = 'OPEN') = (decided_at IS NULL)),
    CONSTRAINT proposals_comment_status_check CHECK (comment IS NULL OR status = 'DECLINED')
);

-- The proposals of a board, its open ones to count and the closed ones it keeps.
CREATE INDEX proposals_board_id_id_idx ON proposals (board_id, id);
-- Deleting a user and the transfer of a guest.
CREATE INDEX proposals_author_id_idx ON proposals (author_id);
CREATE INDEX proposals_decided_by_idx ON proposals (decided_by);

-- The board as it was right before a proposal was accepted into it.
ALTER TABLE board_versions
    DROP CONSTRAINT board_versions_reason_check,
    ADD CONSTRAINT board_versions_reason_check CHECK (reason IN ('AUTO', 'MANUAL', 'RESTORE', 'PROPOSAL'));

-- A notification about a proposal: a new one to those who review it, the answer to its author. The title comes from the
-- proposal on read, and the notification goes with it.
ALTER TABLE notifications
    ADD COLUMN proposal_id uuid REFERENCES proposals (id) ON DELETE CASCADE,
    DROP CONSTRAINT notifications_kind_check,
    ADD CONSTRAINT notifications_kind_check
        CHECK (kind IN ('MENTION', 'REPLY', 'ASSIGNED', 'ACCESS_REQUEST', 'ACCESS_GRANTED', 'ACCESS_DECLINED',
                        'OWNERSHIP', 'PROPOSAL_CREATED', 'PROPOSAL_ACCEPTED', 'PROPOSAL_DECLINED')),
    ADD CONSTRAINT notifications_proposal_id_check
        CHECK ((proposal_id IS NOT NULL) = (kind IN ('PROPOSAL_CREATED', 'PROPOSAL_ACCEPTED', 'PROPOSAL_DECLINED')));

-- Deleting a proposal.
CREATE INDEX notifications_proposal_id_idx ON notifications (proposal_id);
