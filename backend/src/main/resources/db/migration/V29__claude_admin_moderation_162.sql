-- An administrator of the installation blocks a user: they no longer sign in, and their sessions are deleted.
ALTER TABLE users ADD COLUMN blocked_at timestamptz;

-- An administrator closed the link and the live image of a board: its owner opens neither again until it is lifted.
ALTER TABLE boards ADD COLUMN sharing_blocked_at timestamptz;

-- Reports of readers of boards shown without a sign-in; the address of the sender is not kept.
CREATE TABLE board_reports (
    id               uuid        PRIMARY KEY DEFAULT uuidv7(),
    board_id         uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    reason           text        NOT NULL CHECK (reason IN ('SPAM', 'ILLEGAL', 'ABUSE', 'OTHER')),
    message          text        NOT NULL DEFAULT '' CHECK (char_length(message) <= 1000),
    reporter_id      uuid        REFERENCES users (id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL,
    resolved_at      timestamptz,
    resolved_by      uuid        REFERENCES users (id) ON DELETE SET NULL,
    resolved_by_name text,
    CHECK ((resolved_at IS NULL) = (resolved_by_name IS NULL))
);
CREATE INDEX board_reports_open_by_board ON board_reports (board_id, created_at) WHERE resolved_at IS NULL;
CREATE INDEX board_reports_resolved ON board_reports (resolved_at) WHERE resolved_at IS NOT NULL;
-- Deleting a user sets these to NULL: every foreign key to users has an index that starts with it.
CREATE INDEX board_reports_reporter ON board_reports (reporter_id);
CREATE INDEX board_reports_resolved_by ON board_reports (resolved_by);

-- What administrators did, to whom and when. No foreign keys and copies of names: the journal outlives both.
CREATE TABLE admin_actions (
    id           uuid        PRIMARY KEY DEFAULT uuidv7(),
    admin_id     uuid        NOT NULL,
    admin_name   text        NOT NULL,
    action       text        NOT NULL CHECK (action IN (
        'BLOCK_USER', 'UNBLOCK_USER', 'DELETE_USER', 'BLOCK_SHARING', 'UNBLOCK_SHARING', 'TRASH_BOARD', 'RESOLVE_REPORTS'
    )),
    target_kind  text        NOT NULL CHECK (target_kind IN ('USER', 'BOARD')),
    target_id    uuid        NOT NULL,
    target_label text        NOT NULL,
    details      text,
    created_at   timestamptz NOT NULL
);
CREATE INDEX admin_actions_by_time ON admin_actions (created_at DESC, id DESC);
