-- Personal organization of the list of boards: folders, tags and the folder of each board, which only their user sees.
-- Rows are the user's, not the board's: other participants of a shared board neither see nor change them.

-- Folders of a user. A name is unique for its user regardless of case; the service compares names as well.
CREATE TABLE board_folders (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name       text        NOT NULL
        CONSTRAINT board_folders_name_check CHECK (char_length(name) BETWEEN 1 AND 60 AND name = btrim(name)),
    created_at timestamptz NOT NULL,
    -- The target of the folder of a board, which must be a folder of the same user.
    CONSTRAINT board_folders_id_user_id_key UNIQUE (id, user_id)
);

-- The folders of a user, a name per user, and deleting a user.
CREATE UNIQUE INDEX board_folders_user_id_name_idx ON board_folders (user_id, lower(name));

-- Tags that a user gives a board of their list, their own or a shared one.
CREATE TABLE board_tags (
    user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    board_id uuid NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    tag      text NOT NULL CONSTRAINT board_tags_tag_check CHECK (char_length(tag) BETWEEN 1 AND 30 AND tag = btrim(tag))
);

-- A tag once per board and user regardless of case; it starts with user_id for the tags of a user.
CREATE UNIQUE INDEX board_tags_user_id_board_id_tag_idx ON board_tags (user_id, board_id, lower(tag));
-- Deleting a board and forgetting the users who lost access to it.
CREATE INDEX board_tags_board_id_idx ON board_tags (board_id);

-- The folder of a board for a user: one at most. Deleting the folder takes the board out of it.
CREATE TABLE board_placements (
    user_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    board_id  uuid NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    folder_id uuid NOT NULL,
    PRIMARY KEY (user_id, board_id),
    CONSTRAINT board_placements_folder_fkey FOREIGN KEY (folder_id, user_id)
        REFERENCES board_folders (id, user_id) ON DELETE CASCADE
);

-- Deleting a board and forgetting the users who lost access to it; deleting a folder.
CREATE INDEX board_placements_board_id_idx ON board_placements (board_id);
CREATE INDEX board_placements_folder_id_idx ON board_placements (folder_id);

-- The text of the document that search finds a board by: names of pages and texts of elements, a line each, as collab
-- extracts them. NULL until collab has sent it, e.g. for documents stored before.
ALTER TABLE board_documents
    ADD COLUMN search_text text CONSTRAINT board_documents_search_text_check CHECK (char_length(search_text) <= 100000);

-- Documents whose text collab still has to send; the index stays small once it has.
CREATE INDEX board_documents_without_search_text_idx ON board_documents (board_id) WHERE search_text IS NULL;
