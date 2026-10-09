ALTER TABLE boards ADD COLUMN deleted_at timestamptz;
CREATE INDEX boards_trash_by_owner ON boards (owner_id, deleted_at) WHERE deleted_at IS NOT NULL;
