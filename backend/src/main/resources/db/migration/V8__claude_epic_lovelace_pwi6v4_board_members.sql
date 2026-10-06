-- Members of boards: users whom the owner gave a role of their own, EDITOR or VIEWER. A member gets the higher of this
-- role and what the link of the board gives. The owner is never a member of their board.
CREATE TABLE board_members (
    board_id   uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role       text        NOT NULL CONSTRAINT board_members_role_check CHECK (role IN ('EDITOR', 'VIEWER')),
    created_at timestamptz NOT NULL,
    PRIMARY KEY (board_id, user_id)
);

-- The primary key does not start with user_id: boards shared with a user, the transfer of a guest and deleting a user.
CREATE INDEX board_members_user_id_idx ON board_members (user_id);

-- Invitation links of boards: whoever opens one becomes a member with its role. Revoking deletes the row; members who
-- joined through it stay.
CREATE TABLE board_invites (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    board_id   uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    -- The secret part of the address /invite/<token>: 128 random bits in base64url.
    token      text        NOT NULL UNIQUE CHECK (char_length(token) = 22),
    role       text        NOT NULL CONSTRAINT board_invites_role_check CHECK (role IN ('EDITOR', 'VIEWER')),
    created_at timestamptz NOT NULL
);

CREATE INDEX board_invites_board_id_created_at_idx ON board_invites (board_id, created_at);
