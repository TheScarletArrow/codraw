CREATE TABLE boards (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    title      text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE INDEX boards_updated_at_idx ON boards (updated_at DESC);

CREATE TABLE board_documents (
    board_id   uuid        PRIMARY KEY REFERENCES boards (id) ON DELETE CASCADE,
    state      bytea       NOT NULL,
    updated_at timestamptz NOT NULL
);
