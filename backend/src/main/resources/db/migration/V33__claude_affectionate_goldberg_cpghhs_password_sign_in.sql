-- The passwords of users who sign in with a login and a password: users.provider is 'password' and
-- users.provider_user_id is the login in lower case. Only a slow salted hash with the id of its algorithm, e.g.
-- {bcrypt}$2a$10$…, never the password. Kept apart from users, so that reading a user or exporting their data never
-- reads it; it goes with the user.
CREATE TABLE password_credentials (
    user_id       uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    password_hash text        NOT NULL,
    changed_at    timestamptz NOT NULL
);
