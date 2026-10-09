-- Manual revert for V26. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: forgets all workspaces, their members, invitations and projects; they are not restored. The boards of
-- workspaces stay, as personal boards of the users responsible for them, with their documents and their members.

DROP INDEX boards_project_id_idx;

DROP INDEX boards_workspace_id_updated_at_idx;

ALTER TABLE boards DROP COLUMN workspace_access;

ALTER TABLE boards DROP CONSTRAINT boards_project_in_workspace_check;

ALTER TABLE boards DROP CONSTRAINT boards_project_fkey;

ALTER TABLE boards DROP COLUMN project_id;

ALTER TABLE boards DROP COLUMN workspace_id;

DROP INDEX workspace_projects_workspace_id_name_idx;

DROP TABLE workspace_projects;

DROP INDEX workspace_invites_workspace_id_idx;

DROP TABLE workspace_invites;

DROP INDEX workspace_members_user_id_idx;

DROP TABLE workspace_members;

DROP TABLE workspaces;

DELETE FROM flyway_schema_history WHERE version = '26';
