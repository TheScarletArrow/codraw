-- Requests of users for access to boards: a user without access asks the owner for viewing or editing, a viewer for
-- editing. The owner answers by giving a role, which makes the user a member, or by declining; either deletes the
-- request, and so does a change that gives the user the role anyway. A user has one request per board: a new one
-- replaces it, with a new id.
CREATE TABLE board_access_requests (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    board_id   uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role       text        NOT NULL CONSTRAINT board_access_requests_role_check CHECK (role IN ('EDITOR', 'VIEWER')),
    -- What the user tells the owner; NULL when they tell nothing.
    message    text        CHECK (char_length(message) BETWEEN 1 AND 500),
    created_at timestamptz NOT NULL,
    CONSTRAINT board_access_requests_board_id_user_id_key UNIQUE (board_id, user_id)
);

-- The unique key does not start with user_id: the transfer of a guest and deleting a user.
CREATE INDEX board_access_requests_user_id_idx ON board_access_requests (user_id);
