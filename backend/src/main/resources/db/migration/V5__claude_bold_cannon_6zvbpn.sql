-- Earlier states of board documents, which the owner views and restores. AUTO versions are made by the backend when
-- a document is stored, MANUAL ones by the owner, RESTORE ones keep the state from before a restore.
CREATE TABLE board_versions (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    board_id   uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    state      bytea       NOT NULL,
    reason     text        NOT NULL CONSTRAINT board_versions_reason_check CHECK (reason IN ('AUTO', 'MANUAL', 'RESTORE')),
    created_at timestamptz NOT NULL
);

CREATE INDEX board_versions_board_id_created_at_idx ON board_versions (board_id, created_at DESC);
