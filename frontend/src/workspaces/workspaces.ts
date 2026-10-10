import type { WorkspaceAccess } from '../api/boards.ts'
import type { WorkspaceRole } from '../api/workspaces.ts'
import { workspacesMessages } from './messages.tsx'

/** The name of a role in a workspace in the language of the interface. */
export const workspaceRoleLabel = (role: WorkspaceRole): string => workspacesMessages.roles[role]

/** All roles, from the most allowed. */
export const WORKSPACE_ROLES: WorkspaceRole[] = ['owner', 'admin', 'editor', 'viewer']

/** Those who manage the workspace: its name, projects, members within their reach and all its boards. */
export const managesWorkspace = (role: WorkspaceRole) => role === 'owner' || role === 'admin'

/** Those who create boards in the workspace and bring their boards into it. */
export const createsBoards = (role: WorkspaceRole) => role !== 'viewer'

/**
 * Whether a member with the role `own` gives the role `role` to others or takes it from them: an owner any role, an
 * administrator only those of editors and viewers. The backend checks the same.
 */
export function mayGive(own: WorkspaceRole, role: WorkspaceRole): boolean {
  return own === 'owner' || (own === 'admin' && (role === 'editor' || role === 'viewer'))
}

/** The roles that a member with the role `own` gives, from the most allowed. */
export const rolesGivenBy = (own: WorkspaceRole) => WORKSPACE_ROLES.filter((role) => mayGive(own, role))

/** The choices of what the workspace gives its members on a board, as the window «Поделиться» offers them. */
export const WORKSPACE_ACCESS_VALUES: WorkspaceAccess[] = ['edit', 'view', 'none']

/** A choice of access with its label and description in the language of the interface. */
export const workspaceAccessOption = (value: WorkspaceAccess) => workspacesMessages.accessOptions[value]

/** What the workspace gives its members on the board, as those who do not manage it see it. */
export const workspaceAccessOfOthers = (access: WorkspaceAccess): string => workspacesMessages.accessOfOthers[access]

/** The address of a workspace in the app. */
export const workspacePath = (id: string) => `/workspaces/${encodeURIComponent(id)}`

/** The longest name of a workspace that the backend accepts. */
export const WORKSPACE_NAME_MAX_LENGTH = 80

/** The longest name of a project that the backend accepts. */
export const PROJECT_NAME_MAX_LENGTH = 60

/** Which boards of the workspace its page shows: all, those in no project, or those of one project. */
export type ProjectFilter = { kind: 'all' } | { kind: 'none' } | { kind: 'project'; id: string }

export const ALL_PROJECTS: ProjectFilter = { kind: 'all' }

/** Whether a board of the project `projectId` passes the filter. */
export function inProject(filter: ProjectFilter, projectId: string | null): boolean {
  if (filter.kind === 'all') return true
  if (filter.kind === 'none') return projectId === null
  return projectId === filter.id
}
