-- Boards of other users that a user opened through their links, for the list «Открытые по ссылке».
CREATE TABLE board_visits (
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    board_id   uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    visited_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, board_id)
);

CREATE INDEX board_visits_user_id_visited_at_idx ON board_visits (user_id, visited_at DESC);

-- The primary key does not start with board_id, so deleting a board needs its own index.
CREATE INDEX board_visits_board_id_idx ON board_visits (board_id);
