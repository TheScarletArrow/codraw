-- The lead of a board: one of its members whom its owner made responsible for it. The lead manages the board like its
-- owner, except deleting it, giving it away and changing the lead. Referring to the membership keeps the lead a member:
-- whatever ends the membership — the member is removed, leaves the workspace, gets the board, deletes the account —
-- leaves the board without a lead.
ALTER TABLE boards
    ADD COLUMN lead_id uuid,
    ADD CONSTRAINT boards_lead_fkey FOREIGN KEY (id, lead_id) REFERENCES board_members (board_id, user_id)
        ON DELETE SET NULL (lead_id);
