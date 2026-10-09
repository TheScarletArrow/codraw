-- Connections of users to an issue tracker: GitHub, or GitHub Enterprise Server, through a personal access token of the
-- user. A connection is its user's own: the backend reads and creates issues with it only when its user asks, and the
-- API never returns the token, which is a secret.
CREATE TABLE issue_tracker_connections (
    user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    tracker     text        NOT NULL
        CONSTRAINT issue_tracker_connections_tracker_check CHECK (tracker IN ('GITHUB')),
    token       text        NOT NULL
        CONSTRAINT issue_tracker_connections_token_check CHECK (char_length(token) BETWEEN 1 AND 512),
    -- The account of the tracker that the token belongs to, as the tracker named it when the user connected.
    login       text        NOT NULL
        CONSTRAINT issue_tracker_connections_login_check CHECK (char_length(login) BETWEEN 1 AND 100),
    created_at  timestamptz NOT NULL,
    -- When the tracker refused the token, e.g. it expired or was revoked: it is not used until the user enters another.
    rejected_at timestamptz,
    PRIMARY KEY (user_id, tracker)
);

-- Issues of the tracker linked to an element of a page of a board or to a thread of comments of the board, with what
-- CoDraw last learned of each: its title and state. Whoever may open the board sees them; the token of the user who
-- linked the issue keeps them up to date, and so do events of a webhook of the tracker.
CREATE TABLE issue_links (
    -- uuidv7 grows with the time of the insert.
    id               uuid        PRIMARY KEY DEFAULT uuidv7(),
    board_id         uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    -- An element: the page and the cell in the document of the board; the cell may be deleted since.
    page_id          text
        CONSTRAINT issue_links_page_id_check CHECK (char_length(page_id) BETWEEN 1 AND 100),
    cell_id          text
        CONSTRAINT issue_links_cell_id_check CHECK (char_length(cell_id) BETWEEN 1 AND 100),
    -- Or a thread of comments of the board, which takes its links with it.
    thread_id        uuid        REFERENCES comment_threads (id) ON DELETE CASCADE,
    tracker          text        NOT NULL CONSTRAINT issue_links_tracker_check CHECK (tracker IN ('GITHUB')),
    -- The id of the issue in the tracker, which stays when its repository is renamed or the issue is transferred.
    external_id      bigint      NOT NULL CONSTRAINT issue_links_external_id_check CHECK (external_id > 0),
    -- `owner/name` of the repository and the number of the issue in it.
    repository       text        NOT NULL
        CONSTRAINT issue_links_repository_check CHECK (char_length(repository) BETWEEN 3 AND 200),
    number           integer     NOT NULL CONSTRAINT issue_links_number_check CHECK (number > 0),
    title            text        NOT NULL CONSTRAINT issue_links_title_check CHECK (char_length(title) <= 1000),
    state            text        NOT NULL CONSTRAINT issue_links_state_check CHECK (state IN ('OPEN', 'CLOSED')),
    state_reason     text
        CONSTRAINT issue_links_state_reason_check
            CHECK (state_reason IN ('COMPLETED', 'NOT_PLANNED', 'DUPLICATE', 'REOPENED')),
    -- The page of the issue in the tracker.
    url              text        NOT NULL CONSTRAINT issue_links_url_check CHECK (char_length(url) BETWEEN 8 AND 2048),
    -- Whether the repository is private: its issues are seen in CoDraw only because somebody chose to link them.
    private          boolean     NOT NULL,
    -- When the issue last changed, as the tracker said: an older event of the webhook changes nothing.
    issue_updated_at timestamptz NOT NULL,
    -- What CoDraw learned when it last asked: the issue is there, the token no longer reaches it, or it was deleted.
    sync_status      text        NOT NULL
        CONSTRAINT issue_links_sync_status_check CHECK (sync_status IN ('OK', 'NO_ACCESS', 'DELETED')),
    synced_at        timestamptz NOT NULL,
    -- Whose token keeps the link up to date; `NULL` once they are deleted.
    linked_by        uuid        REFERENCES users (id) ON DELETE SET NULL,
    -- The issue was created from CoDraw, with a link back to the element or the thread.
    created_here     boolean     NOT NULL,
    created_at       timestamptz NOT NULL,
    CONSTRAINT issue_links_target_check CHECK (
        (thread_id IS NULL AND page_id IS NOT NULL AND cell_id IS NOT NULL)
        OR (thread_id IS NOT NULL AND page_id IS NULL AND cell_id IS NULL)
    ),
    -- An issue is linked to an element or to a thread once, however often it is linked.
    CONSTRAINT issue_links_target_issue_key
        UNIQUE NULLS NOT DISTINCT (board_id, page_id, cell_id, thread_id, tracker, external_id)
);

-- Events of the webhook of the tracker.
CREATE INDEX issue_links_tracker_external_id_idx ON issue_links (tracker, external_id);
-- Deleting a thread.
CREATE INDEX issue_links_thread_id_idx ON issue_links (thread_id) WHERE thread_id IS NOT NULL;
-- Deleting a user.
CREATE INDEX issue_links_linked_by_idx ON issue_links (linked_by);

-- Issues that users asked to create from CoDraw, by the id of the request that the client chose: a repeated request,
-- e.g. after an answer that was lost, gets the link of the first one instead of a second issue in the tracker.
CREATE TABLE issue_creations (
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    request_id uuid        NOT NULL,
    -- The link of the created issue; `NULL` while the backend is creating it.
    link_id    uuid        REFERENCES issue_links (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, request_id)
);

-- Deleting a link.
CREATE INDEX issue_creations_link_id_idx ON issue_creations (link_id);
