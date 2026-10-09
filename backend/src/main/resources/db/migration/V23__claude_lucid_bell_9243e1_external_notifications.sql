-- Channels through which a user hears of their notifications outside of CoDraw: an email address and an incoming
-- webhook of a team chat, one of each at most. A channel is its user's own: nobody else reads it, and the API never
-- returns the address of a webhook, which is a secret: whoever knows it writes into the chat.
CREATE TABLE notification_channels (
    -- uuidv7 grows with the time of the insert.
    id                      uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id                 uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind                    text        NOT NULL
        CONSTRAINT notification_channels_kind_check CHECK (kind IN ('EMAIL', 'WEBHOOK')),
    -- The email address, or the URL of the incoming webhook.
    address                 text        NOT NULL
        CONSTRAINT notification_channels_address_check CHECK (char_length(address) BETWEEN 3 AND 2048),
    enabled                 boolean     NOT NULL,
    -- The groups of kinds of notifications that the channel delivers.
    events                  text[]      NOT NULL
        CONSTRAINT notification_channels_events_check
            CHECK (events <@ ARRAY ['MENTIONS', 'REPLIES', 'ASSIGNMENTS', 'ACCESS', 'REVIEWS']::text[]),
    -- When the owner of the address confirmed it through the link of a letter; a webhook is confirmed as it is saved.
    verified_at             timestamptz,
    -- SHA-256 of the token of the link that confirms the address, and when the letter with it went.
    verification_token_hash bytea
        CONSTRAINT notification_channels_verification_token_hash_check CHECK (length(verification_token_hash) = 32),
    verification_sent_at    timestamptz,
    -- What the settings tell of the channel: when a message last went, and the last failure, which a success clears.
    last_delivered_at       timestamptz,
    last_error              text
        CONSTRAINT notification_channels_last_error_check CHECK (last_error IN ('REJECTED', 'UNAVAILABLE')),
    last_error_at           timestamptz,
    created_at              timestamptz NOT NULL,
    CONSTRAINT notification_channels_user_id_kind_key UNIQUE (user_id, kind),
    CONSTRAINT notification_channels_verified_at_check CHECK (kind = 'EMAIL' OR verified_at IS NOT NULL),
    CONSTRAINT notification_channels_last_error_at_check CHECK ((last_error IS NULL) = (last_error_at IS NULL))
);

-- Boards whose notifications go to none of the channels of the user; the bell of the app shows them all the same.
CREATE TABLE notification_board_mutes (
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    board_id   uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, board_id)
);

-- Deleting a board.
CREATE INDEX notification_board_mutes_board_id_idx ON notification_board_mutes (board_id);

-- The queue of messages: a notification to one channel of its recipient, queued in the transaction that creates the
-- notification and sent by a background task. A notification that goes before it is sent, e.g. a cancelled request
-- for access or a deleted comment, takes its messages with it.
CREATE TABLE notification_deliveries (
    -- uuidv7 grows with the time of the insert.
    id              uuid        PRIMARY KEY DEFAULT uuidv7(),
    notification_id uuid        NOT NULL REFERENCES notifications (id) ON DELETE CASCADE,
    channel_id      uuid        NOT NULL REFERENCES notification_channels (id) ON DELETE CASCADE,
    status          text        NOT NULL
        CONSTRAINT notification_deliveries_status_check CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
    attempts        integer     NOT NULL CONSTRAINT notification_deliveries_attempts_check CHECK (attempts >= 0),
    -- When a pending message is due: the first attempt, the next one after a failure, or the end of the lease of the
    -- instance of the backend that is sending it.
    next_attempt_at timestamptz NOT NULL,
    -- Why the last attempt failed, or why the message was not sent.
    reason          text
        CONSTRAINT notification_deliveries_reason_check
            CHECK (reason IN ('REJECTED', 'UNAVAILABLE', 'READ', 'SETTINGS', 'NO_ACCESS')),
    created_at      timestamptz NOT NULL,
    finished_at     timestamptz,
    -- One message per notification and channel, however often it is queued.
    CONSTRAINT notification_deliveries_notification_id_channel_id_key UNIQUE (notification_id, channel_id),
    CONSTRAINT notification_deliveries_finished_at_check CHECK ((finished_at IS NULL) = (status = 'PENDING'))
);

-- The messages that are due.
CREATE INDEX notification_deliveries_next_attempt_at_idx ON notification_deliveries (next_attempt_at)
    WHERE status = 'PENDING';
-- Deleting a channel.
CREATE INDEX notification_deliveries_channel_id_idx ON notification_deliveries (channel_id);
