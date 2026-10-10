-- A link may also show a board to anybody without a sign-in, for viewing only.
ALTER TABLE boards DROP CONSTRAINT boards_link_access_check;
ALTER TABLE boards
    ADD CONSTRAINT boards_link_access_check CHECK (link_access IN ('NONE', 'VIEW', 'PUBLIC', 'EDIT'));
