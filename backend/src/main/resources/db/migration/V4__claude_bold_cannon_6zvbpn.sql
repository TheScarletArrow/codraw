-- What a link to a board gives to users other than its owner: nothing, viewing or editing.
-- Existing boards keep working through the links already sent, so they are editable through them.
ALTER TABLE boards
    ADD COLUMN link_access text NOT NULL DEFAULT 'EDIT'
        CONSTRAINT boards_link_access_check CHECK (link_access IN ('NONE', 'VIEW', 'EDIT'));
