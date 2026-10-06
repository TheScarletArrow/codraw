-- When users were on boards, their own and those of others, to tell them what changed since their previous visit. Kept
-- apart from board_visits, which lists the boards shared with a user and keeps the boards of gone guests alive.
CREATE TABLE board_reads (
    user_id          uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    board_id         uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    -- When the user was on the board last, by the clock of the backend.
    seen_at          timestamptz NOT NULL,
    -- When the previous visit of the user ended, which the current one compares the board with; NULL during the first.
    previous_seen_at timestamptz,
    -- Whether a page of the user is on the board: it reported last that it is there, not that it left.
    present          boolean     NOT NULL,
    PRIMARY KEY (user_id, board_id)
);

-- The primary key does not start with board_id, so deleting a board and forgetting the users who lost access need
-- their own index.
CREATE INDEX board_reads_board_id_idx ON board_reads (board_id);
