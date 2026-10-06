-- Notifications of users about what others did that concerns them: a mention or an answer in a comment, a request for
-- access to their board, an answer to their request, a board given to them. A row keeps only who did what to whom and
-- where; the title of the board, the text of the comment and the name of the actor are read with it, so that nothing
-- of a board outlives it or reaches a user who lost access to it. The thread and the page come from the comment.
CREATE TABLE notifications (
    -- uuidv7 grows with the time of the insert: the list goes newest first by id, and an id is the cursor of a page.
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind       text        NOT NULL CONSTRAINT notifications_kind_check
        CHECK (kind IN ('MENTION', 'REPLY', 'ACCESS_REQUEST', 'ACCESS_GRANTED', 'ACCESS_DECLINED', 'OWNERSHIP')),
    board_id   uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    -- The comment that mentions or answers; a deleted comment takes its notifications with it.
    comment_id uuid        REFERENCES comments (id) ON DELETE CASCADE,
    -- Who did it; NULL once they are deleted, e.g. a guest who did not come back.
    actor_id   uuid        REFERENCES users (id) ON DELETE SET NULL,
    -- The role asked for, given or declined.
    role       text        CONSTRAINT notifications_role_check CHECK (role IN ('EDITOR', 'VIEWER')),
    created_at timestamptz NOT NULL,
    read_at    timestamptz,
    CONSTRAINT notifications_comment_id_check CHECK ((comment_id IS NOT NULL) = (kind IN ('MENTION', 'REPLY'))),
    CONSTRAINT notifications_role_kind_check
        CHECK ((role IS NOT NULL) = (kind IN ('ACCESS_REQUEST', 'ACCESS_GRANTED', 'ACCESS_DECLINED'))),
    CONSTRAINT notifications_actor_id_check CHECK (actor_id <> user_id),
    -- One notification per comment and recipient: a mention wins over an answer, and a mention is not repeated.
    CONSTRAINT notifications_user_id_comment_id_key UNIQUE (user_id, comment_id)
);

-- The pages, the unread count and the limit of a user.
CREATE INDEX notifications_user_id_id_idx ON notifications (user_id, id);
-- Deleting a board, a comment or a user, and the transfer of a guest.
CREATE INDEX notifications_board_id_idx ON notifications (board_id);
CREATE INDEX notifications_comment_id_idx ON notifications (comment_id);
CREATE INDEX notifications_actor_id_idx ON notifications (actor_id);
-- The cleanup of notifications older than the retention.
CREATE INDEX notifications_created_at_idx ON notifications (created_at);
