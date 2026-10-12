-- What users tell the administrators of the installation through «Обратная связь»: a bug, an idea or anything else, with
-- the page, the version of the app and the browser it came from. The address of the sender is not kept.
CREATE TABLE feedback (
    id               uuid        PRIMARY KEY DEFAULT uuidv7(),
    -- Feedback outlives its author, as reports do: administrators see it as from a deleted user.
    user_id          uuid        REFERENCES users (id) ON DELETE SET NULL,
    kind             text        NOT NULL CONSTRAINT feedback_kind_check CHECK (kind IN ('BUG', 'IDEA', 'OTHER')),
    text             text        NOT NULL CONSTRAINT feedback_text_check CHECK (char_length(text) BETWEEN 1 AND 4000),
    -- The path of the page, without its query and hash.
    page             text        CONSTRAINT feedback_page_check CHECK (char_length(page) <= 500),
    app_version      text        CONSTRAINT feedback_app_version_check CHECK (char_length(app_version) <= 50),
    user_agent       text        CONSTRAINT feedback_user_agent_check CHECK (char_length(user_agent) <= 500),
    created_at       timestamptz NOT NULL,
    resolved_at      timestamptz,
    resolved_by      uuid        REFERENCES users (id) ON DELETE SET NULL,
    resolved_by_name text,
    CONSTRAINT feedback_resolved_check CHECK ((resolved_at IS NULL) = (resolved_by_name IS NULL))
);
CREATE INDEX feedback_open ON feedback (created_at DESC, id DESC) WHERE resolved_at IS NULL;
CREATE INDEX feedback_resolved ON feedback (resolved_at) WHERE resolved_at IS NOT NULL;
-- Deleting a user sets these to NULL: every foreign key to users has an index that starts with it. The first one also
-- finds the feedback of a user for the export of their data and for the sign-in of a guest.
CREATE INDEX feedback_user ON feedback (user_id);
CREATE INDEX feedback_resolved_by ON feedback (resolved_by);

-- Closing feedback is an action of administrators, and the feedback is its target in the journal.
ALTER TABLE admin_actions
    DROP CONSTRAINT admin_actions_action_check,
    ADD CONSTRAINT admin_actions_action_check CHECK (action IN (
        'BLOCK_USER', 'UNBLOCK_USER', 'DELETE_USER', 'BLOCK_SHARING', 'UNBLOCK_SHARING', 'TRASH_BOARD', 'RESOLVE_REPORTS',
        'RESOLVE_FEEDBACK'
    )),
    DROP CONSTRAINT admin_actions_target_kind_check,
    ADD CONSTRAINT admin_actions_target_kind_check CHECK (target_kind IN ('USER', 'BOARD', 'FEEDBACK'));
