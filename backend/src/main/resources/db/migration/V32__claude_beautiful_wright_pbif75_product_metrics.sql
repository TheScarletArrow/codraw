-- Days on which a user, an account or a guest, used CoDraw: their session made a request to the API that day (UTC).
-- Nothing else of the day is kept; rows go with the user and are deleted once they are 42 days old.
CREATE TABLE user_activity_days (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    day     date NOT NULL,
    PRIMARY KEY (user_id, day)
);
CREATE INDEX user_activity_days_by_day ON user_activity_days (day);

-- Days on which collab stored changes of users to the document of a board (UTC), and whether at least two users had
-- connections that may edit it at the same time that day. No users; rows go with the board and after 42 days.
CREATE TABLE board_activity_days (
    board_id  uuid    NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    day       date    NOT NULL,
    co_edited boolean NOT NULL DEFAULT false,
    PRIMARY KEY (board_id, day)
);
CREATE INDEX board_activity_days_by_day ON board_activity_days (day);

-- Counts of a day without anybody's id, e.g. how many guests signed in with a provider; deleted after 42 days.
CREATE TABLE product_daily_counts (
    day   date    NOT NULL,
    kind  text    NOT NULL CHECK (kind IN ('GUEST_CONVERSION')),
    count integer NOT NULL CHECK (count >= 0),
    PRIMARY KEY (day, kind)
);
