-- Images of boards: their bytes are objects of the S3-compatible storage (boards/{board_id}/{id}), these rows tell
-- what they are. An image stays as long as its board does: versions, proposals and the history of undo may show it
-- again after it left the board.
CREATE TABLE board_images (
    -- uuidv7 grows with the time of the insert.
    id           uuid        PRIMARY KEY DEFAULT uuidv7(),
    -- No foreign key: the rows of a deleted board stay until the cleanup has deleted their objects from the storage,
    -- which takes no part in transactions of the database.
    board_id     uuid        NOT NULL,
    -- The same file is stored once per board.
    sha256       bytea       NOT NULL CONSTRAINT board_images_sha256_check CHECK (length(sha256) = 32),
    -- The type that the signature of the file tells, never the one the browser sent.
    content_type text        NOT NULL
        CONSTRAINT board_images_content_type_check CHECK (content_type IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp')),
    size         bigint      NOT NULL CONSTRAINT board_images_size_check CHECK (size > 0),
    width        integer     NOT NULL CONSTRAINT board_images_width_check CHECK (width > 0),
    height       integer     NOT NULL CONSTRAINT board_images_height_check CHECK (height > 0),
    created_at   timestamptz NOT NULL,
    CONSTRAINT board_images_board_id_sha256_key UNIQUE (board_id, sha256)
);
