-- Who changed a board between its versions. The stored document collects the users whose changes it has since the latest
-- version of the board; a new version takes them as its authors, in the order of their first change. Names come from
-- users on read: the ids of users who are gone stay in the arrays and are skipped then.
ALTER TABLE board_documents ADD COLUMN editors uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE board_versions ADD COLUMN authors uuid[] NOT NULL DEFAULT '{}';

-- The name that the owner or an editor gave a version; versions without one are pruned first.
ALTER TABLE board_versions
    ADD COLUMN name text CONSTRAINT board_versions_name_check CHECK (char_length(name) BETWEEN 1 AND 100);

-- A guest who signs in passes their changes to their account: these find the rows that name the guest.
CREATE INDEX board_documents_editors_idx ON board_documents USING gin (editors);

CREATE INDEX board_versions_authors_idx ON board_versions USING gin (authors);
