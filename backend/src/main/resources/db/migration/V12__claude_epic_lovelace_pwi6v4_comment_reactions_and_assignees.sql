-- Reactions of users to comments: one of a fixed set, each at most once per comment and user. A reaction says who
-- reacted, so it goes with its user as well as with its comment.
CREATE TABLE comment_reactions (
    comment_id uuid        NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reaction   text        NOT NULL CONSTRAINT comment_reactions_reaction_check
        CHECK (reaction IN ('THUMBS_UP', 'HEART', 'PARTY', 'SMILE', 'EYES', 'CHECK')),
    created_at timestamptz NOT NULL,
    PRIMARY KEY (comment_id, user_id, reaction)
);

-- Deleting a user and the transfer of a guest.
CREATE INDEX comment_reactions_user_id_idx ON comment_reactions (user_id);

-- Who takes care of a thread; the thread stays without one once they are deleted, e.g. a guest who did not come back.
ALTER TABLE comment_threads ADD COLUMN assignee_id uuid REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX comment_threads_assignee_id_idx ON comment_threads (assignee_id);

-- A notification of a thread assigned to its recipient is about the thread, not about a comment of it, and goes with
-- the thread. One per thread and recipient: a new assignment replaces the notification of an earlier one.
ALTER TABLE notifications
    ADD COLUMN thread_id uuid REFERENCES comment_threads (id) ON DELETE CASCADE,
    DROP CONSTRAINT notifications_kind_check,
    ADD CONSTRAINT notifications_kind_check
        CHECK (kind IN ('MENTION', 'REPLY', 'ASSIGNED', 'ACCESS_REQUEST', 'ACCESS_GRANTED', 'ACCESS_DECLINED', 'OWNERSHIP')),
    ADD CONSTRAINT notifications_thread_id_check CHECK ((thread_id IS NOT NULL) = (kind = 'ASSIGNED')),
    ADD CONSTRAINT notifications_user_id_thread_id_key UNIQUE (user_id, thread_id);

-- Deleting a thread.
CREATE INDEX notifications_thread_id_idx ON notifications (thread_id);
