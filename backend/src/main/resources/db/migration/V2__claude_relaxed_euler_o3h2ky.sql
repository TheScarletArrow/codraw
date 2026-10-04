CREATE TABLE users (
    id               uuid        PRIMARY KEY DEFAULT uuidv7(),
    provider         text        NOT NULL,
    provider_user_id text        NOT NULL,
    name             text        NOT NULL,
    avatar_url       text,
    created_at       timestamptz NOT NULL,
    CONSTRAINT users_provider_user_uq UNIQUE (provider, provider_user_id)
);

-- Spring Session JDBC: org/springframework/session/jdbc/schema-postgresql.sql
CREATE TABLE spring_session (
    primary_id            char(36)     NOT NULL,
    session_id            char(36)     NOT NULL,
    creation_time         bigint       NOT NULL,
    last_access_time      bigint       NOT NULL,
    max_inactive_interval int          NOT NULL,
    expiry_time           bigint       NOT NULL,
    principal_name        varchar(100),
    CONSTRAINT spring_session_pk PRIMARY KEY (primary_id)
);

CREATE UNIQUE INDEX spring_session_ix1 ON spring_session (session_id);
CREATE INDEX spring_session_ix2 ON spring_session (expiry_time);
CREATE INDEX spring_session_ix3 ON spring_session (principal_name);

CREATE TABLE spring_session_attributes (
    session_primary_id char(36)     NOT NULL,
    attribute_name     varchar(200) NOT NULL,
    attribute_bytes    bytea        NOT NULL,
    CONSTRAINT spring_session_attributes_pk PRIMARY KEY (session_primary_id, attribute_name),
    CONSTRAINT spring_session_attributes_fk FOREIGN KEY (session_primary_id)
        REFERENCES spring_session (primary_id) ON DELETE CASCADE
);

-- Boards created before sign-in have no owner and nobody could open them: there is no user data before the release.
DELETE FROM boards;

ALTER TABLE boards ADD COLUMN owner_id uuid NOT NULL REFERENCES users (id);

-- Boards are now listed per owner only.
DROP INDEX boards_updated_at_idx;

CREATE INDEX boards_owner_id_updated_at_idx ON boards (owner_id, updated_at DESC);
