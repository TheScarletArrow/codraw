import type { WorkspaceAccess } from '../api/boards.ts'
import type { WorkspaceRole } from '../api/workspaces.ts'

/** Roles in a workspace as the interface names them. */
export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  editor: 'Редактор',
  viewer: 'Читатель',
}

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

/** What the workspace gives its members on a board, as the window «Поделиться» offers it. */
export const WORKSPACE_ACCESS_OPTIONS: { value: WorkspaceAccess; label: string; description: string }[] = [
  {
    value: 'edit',
    label: 'Редактирование',
    description: 'Редакторы пространства правят доску, читатели смотрят',
  },
  { value: 'view', label: 'Просмотр', description: 'Все участники пространства только смотрят доску' },
  {
    value: 'none',
    label: 'Только приглашённые',
    description: 'Доску открывают её участники и те, кто управляет пространством',
  },
]

/** What the workspace gives its members on the board, as those who do not manage it see it. */
export const WORKSPACE_ACCESS_OF_OTHERS: Record<WorkspaceAccess, string> = {
  edit: 'Редакторы пространства правят доску, читатели смотрят',
  view: 'Участники пространства смотрят доску без правки',
  none: 'Доска открыта только её участникам и тем, кто управляет пространством',
}

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
