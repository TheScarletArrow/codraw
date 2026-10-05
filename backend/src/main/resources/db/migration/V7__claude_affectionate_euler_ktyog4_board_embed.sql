-- The live image of a page of a board: a public address that serves the latest picture of the page, which the
-- browsers of the participants who edit the board draw and publish. One per board.
CREATE TABLE board_embeds (
    board_id   uuid PRIMARY KEY REFERENCES boards (id) ON DELETE CASCADE,
    -- The secret part of the public address: 128 random bits in base64url.
    token      text NOT NULL UNIQUE CHECK (char_length(token) = 22),
    page_id    text NOT NULL CHECK (char_length(page_id) BETWEEN 1 AND 100),
    -- The cleaned SVG of the page; NULL before the first picture.
    svg        bytea,
    updated_at timestamptz,
    created_at timestamptz NOT NULL
);
