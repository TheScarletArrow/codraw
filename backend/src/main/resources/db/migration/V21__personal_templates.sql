CREATE TABLE personal_templates (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    description text NOT NULL CHECK (char_length(description) <= 1000),
    drawio text NOT NULL CHECK (octet_length(drawio) BETWEEN 1 AND 8388608),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);
CREATE INDEX personal_templates_by_owner ON personal_templates(owner_id, updated_at DESC);
