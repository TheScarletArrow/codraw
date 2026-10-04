-- Who opens a board through its link: nobody but the owner (NONE), viewers (VIEW) or editors (EDIT).
-- The values are the names of the LinkAccess enum. Existing boards keep what their links gave before: editing.
ALTER TABLE boards
    ADD COLUMN link_access text NOT NULL DEFAULT 'EDIT' CHECK (link_access IN ('NONE', 'VIEW', 'EDIT'));
