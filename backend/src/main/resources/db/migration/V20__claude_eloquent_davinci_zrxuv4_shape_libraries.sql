-- Personal libraries of shapes: components that a user saved from boards or made of their pictures, which only they see
-- and add to boards. A component is a diagram of draw.io (<mxGraphModel>) with its pictures inside as data: addresses,
-- so it depends on no board; copies on boards are cells of their boards and do not refer to it.

-- Libraries of a user; they go with their user, e.g. a guest deleted by the cleanup of gone guests.
CREATE TABLE shape_libraries (
    -- uuidv7 grows with the time of the insert.
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name       text        NOT NULL
        CONSTRAINT shape_libraries_name_check CHECK (char_length(name) BETWEEN 1 AND 60 AND name = btrim(name)),
    created_at timestamptz NOT NULL
);

-- The libraries of a user, and deleting a user.
CREATE INDEX shape_libraries_user_id_idx ON shape_libraries (user_id);

-- Components of a library, in the order they were added.
CREATE TABLE library_components (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    library_id uuid        NOT NULL REFERENCES shape_libraries (id) ON DELETE CASCADE,
    name       text        NOT NULL
        CONSTRAINT library_components_name_check CHECK (char_length(name) BETWEEN 1 AND 80 AND name = btrim(name)),
    -- The diagram of draw.io, which the backend has checked: no DTD, only safe pictures inside.
    content    text        NOT NULL,
    -- A small PNG of the component as a data: address, or none.
    preview    text,
    -- Bytes of the content and the preview in UTF-8, which count against the room of the user.
    size       integer     NOT NULL CONSTRAINT library_components_size_check CHECK (size > 0),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

-- The components of a library in their order, and deleting a library.
CREATE INDEX library_components_library_id_idx ON library_components (library_id, created_at);
