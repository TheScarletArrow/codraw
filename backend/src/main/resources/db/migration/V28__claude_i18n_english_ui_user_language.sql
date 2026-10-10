-- The language of the interface of a user, in which letters and messages of notifications reach them: `RU` or `EN`. The
-- app tells it whenever it opens in another language; users that never did read Russian, as before.
ALTER TABLE users
    ADD COLUMN language text NOT NULL DEFAULT 'RU' CONSTRAINT users_language_check CHECK (language IN ('RU', 'EN'));
