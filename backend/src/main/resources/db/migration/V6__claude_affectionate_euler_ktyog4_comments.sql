-- Threads of comments on boards: on an element of a page (a cell of the board document) or on the whole page. They
-- outlive the elements and versions of the board and go with the board. A comment of a user who is gone stays, without
-- its author.
CREATE TABLE comment_threads (
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    board_id    uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    page_id     text        NOT NULL CHECK (char_length(page_id) BETWEEN 1 AND 100),
    cell_id     text        CHECK (char_length(cell_id) BETWEEN 1 AND 100),
    resolved_at timestamptz,
    resolved_by uuid        REFERENCES users (id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL
);

CREATE INDEX comment_threads_board_id_created_at_idx ON comment_threads (board_id, created_at);

CREATE TABLE comments (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    thread_id  uuid        NOT NULL REFERENCES comment_threads (id) ON DELETE CASCADE,
    author_id  uuid        REFERENCES users (id) ON DELETE SET NULL,
    body       text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    created_at timestamptz NOT NULL,
    edited_at  timestamptz
);

CREATE INDEX comments_thread_id_created_at_idx ON comments (thread_id, created_at);
CREATE INDEX comments_author_id_idx ON comments (author_id);

-- Users mentioned in comments, with @ and their names.
CREATE TABLE comment_mentions (
    comment_id uuid NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX comment_mentions_user_id_idx ON comment_mentions (user_id);
