-- Team workspaces: their members with roles, invitation links, projects as shared folders, and the boards that belong to
-- a workspace with what the workspace gives its members on each of them.

-- A workspace. Its name is trimmed by the service, as names of folders are.
CREATE TABLE workspaces (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    name       text        NOT NULL
        CONSTRAINT workspaces_name_check CHECK (char_length(name) BETWEEN 1 AND 80 AND name = btrim(name)),
    created_at timestamptz NOT NULL
);

-- Members of workspaces, a role each. A workspace always has an owner: the service keeps the last one.
CREATE TABLE workspace_members (
    workspace_id uuid        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role         text        NOT NULL CONSTRAINT workspace_members_role_check CHECK (role IN ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER')),
    created_at   timestamptz NOT NULL,
    PRIMARY KEY (workspace_id, user_id)
);

-- The workspaces of a user, and deleting a user.
CREATE INDEX workspace_members_user_id_idx ON workspace_members (user_id);

-- Invitation links of workspaces: whoever accepts one becomes a member with its role. Nobody becomes an owner this way.
CREATE TABLE workspace_invites (
    id           uuid        PRIMARY KEY DEFAULT uuidv7(),
    workspace_id uuid        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    token        text        NOT NULL CONSTRAINT workspace_invites_token_key UNIQUE,
    role         text        NOT NULL CONSTRAINT workspace_invites_role_check CHECK (role IN ('ADMIN', 'EDITOR', 'VIEWER')),
    created_at   timestamptz NOT NULL
);

CREATE INDEX workspace_invites_workspace_id_idx ON workspace_invites (workspace_id);

-- Projects: the shared folders of a workspace, which all its members see.
CREATE TABLE workspace_projects (
    id           uuid        PRIMARY KEY DEFAULT uuidv7(),
    workspace_id uuid        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    name         text        NOT NULL
        CONSTRAINT workspace_projects_name_check CHECK (char_length(name) BETWEEN 1 AND 60 AND name = btrim(name)),
    created_at   timestamptz NOT NULL,
    -- The target of the project of a board, which must be a project of the workspace of the board.
    CONSTRAINT workspace_projects_id_workspace_id_key UNIQUE (id, workspace_id)
);

-- The projects of a workspace, a name per workspace regardless of case.
CREATE UNIQUE INDEX workspace_projects_workspace_id_name_idx ON workspace_projects (workspace_id, lower(name));

-- The workspace that a board belongs to, NULL for a personal board. Deleting a workspace takes its boards out first.
ALTER TABLE boards ADD COLUMN workspace_id uuid REFERENCES workspaces (id);

-- The project of a board of a workspace. Deleting the project leaves the board in the workspace, in no project.
ALTER TABLE boards ADD COLUMN project_id uuid;
ALTER TABLE boards ADD CONSTRAINT boards_project_fkey FOREIGN KEY (project_id, workspace_id)
    REFERENCES workspace_projects (id, workspace_id) ON DELETE SET NULL (project_id);
ALTER TABLE boards ADD CONSTRAINT boards_project_in_workspace_check CHECK (project_id IS NULL OR workspace_id IS NOT NULL);

-- What the workspace gives its editors and viewers on the board: EDIT their roles, VIEW viewing, NONE nothing. Owners
-- and administrators of the workspace manage its boards whatever it is. A personal board ignores it.
ALTER TABLE boards ADD COLUMN workspace_access text NOT NULL DEFAULT 'EDIT'
    CONSTRAINT boards_workspace_access_check CHECK (workspace_access IN ('NONE', 'VIEW', 'EDIT'));

-- The boards of a workspace, the latest changed first; personal boards stay out of the index.
CREATE INDEX boards_workspace_id_updated_at_idx ON boards (workspace_id, updated_at DESC) WHERE workspace_id IS NOT NULL;
-- Deleting a project.
CREATE INDEX boards_project_id_idx ON boards (project_id) WHERE project_id IS NOT NULL;
