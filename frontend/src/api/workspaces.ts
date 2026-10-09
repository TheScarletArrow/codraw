import type { Board, BoardOwner, BoardRole, LinkAccess, WorkspaceAccess } from './boards.ts'
import { HttpError, request } from './http.ts'

/**
 * The role of a member of a team workspace: its owners manage everything, its administrators its editors, viewers,
 * projects and boards, its editors create and edit boards, its viewers view them.
 */
export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer'

/** A workspace of the current user, with their role in it. */
export interface Workspace {
  id: string
  name: string
  role: WorkspaceRole
  createdAt: string
  members: number
  /** The boards of the workspace, without those in the trash. */
  boards: number
}

export interface WorkspaceMember {
  id: string
  name: string
  avatarUrl: string | null
  role: WorkspaceRole
  joinedAt: string
}

/** An invitation link of a workspace: whoever accepts it becomes a member with its role. */
export interface WorkspaceInvite {
  id: string
  /** The address of the invitation from the root of the site, `/workspace-invite/…`. */
  path: string
  role: WorkspaceRole
  createdAt: string
}

/** A shared folder of the boards of a workspace. */
export interface WorkspaceProject {
  id: string
  name: string
}

/** A board of a workspace, as the current user sees it in the workspace. */
export interface WorkspaceBoard {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  linkAccess: LinkAccess
  workspaceAccess: WorkspaceAccess
  /** The member of the workspace responsible for the board. */
  owner: BoardOwner
  role: BoardRole
  projectId: string | null
  /** When the user was last on the board; `null` while they never were. */
  openedAt: string | null
}

/** Query key of the workspaces of the user. */
export const WORKSPACES_QUERY_KEY = ['workspaces'] as const

export const workspaceKey = (id: string) => ['workspaces', id] as const
export const workspaceBoardsKey = (id: string) => ['workspaces', id, 'boards'] as const
export const workspaceMembersKey = (id: string) => ['workspaces', id, 'members'] as const
export const workspaceInvitesKey = (id: string) => ['workspaces', id, 'invites'] as const
export const workspaceProjectsKey = (id: string) => ['workspaces', id, 'projects'] as const

const path = (id: string) => `/api/workspaces/${encodeURIComponent(id)}`

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const fetchWorkspaces = (): Promise<Workspace[]> => request('/api/workspaces')

export const fetchWorkspace = (id: string): Promise<Workspace> => request(path(id))

export const createWorkspace = (name: string): Promise<Workspace> => request('/api/workspaces', json('POST', { name }))

export const renameWorkspace = (id: string, name: string): Promise<Workspace> => request(path(id), json('PATCH', { name }))

/** Deletes the workspace; its boards go to the trash of the owner who deletes it. */
export const deleteWorkspace = (id: string): Promise<void> => request(path(id), { method: 'DELETE' })

export const fetchWorkspaceMembers = (id: string): Promise<WorkspaceMember[]> => request(`${path(id)}/members`)

export const changeWorkspaceRole = (id: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember> =>
  request(`${path(id)}/members/${encodeURIComponent(userId)}`, json('PUT', { role }))

/** Takes a member out of the workspace; with their own id the user leaves it. */
export const removeWorkspaceMember = (id: string, userId: string): Promise<void> =>
  request(`${path(id)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })

export const fetchWorkspaceInvites = (id: string): Promise<WorkspaceInvite[]> => request(`${path(id)}/invites`)

export const createWorkspaceInvite = (id: string, role: WorkspaceRole): Promise<WorkspaceInvite> =>
  request(`${path(id)}/invites`, json('POST', { role }))

export const revokeWorkspaceInvite = (id: string, inviteId: string): Promise<void> =>
  request(`${path(id)}/invites/${encodeURIComponent(inviteId)}`, { method: 'DELETE' })

export const acceptWorkspaceInvite = (token: string): Promise<Workspace> =>
  request(`/api/workspace-invites/${encodeURIComponent(token)}/accept`, { method: 'POST' })

export const fetchProjects = (id: string): Promise<WorkspaceProject[]> => request(`${path(id)}/projects`)

export const createProject = (id: string, name: string): Promise<WorkspaceProject> =>
  request(`${path(id)}/projects`, json('POST', { name }))

export const renameProject = (id: string, projectId: string, name: string): Promise<WorkspaceProject> =>
  request(`${path(id)}/projects/${encodeURIComponent(projectId)}`, json('PATCH', { name }))

/** Deletes the project; its boards stay in the workspace, in no project. */
export const deleteProject = (id: string, projectId: string): Promise<void> =>
  request(`${path(id)}/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' })

export const fetchWorkspaceBoards = (id: string): Promise<WorkspaceBoard[]> => request(`${path(id)}/boards`)

export const createWorkspaceBoard = (id: string, title: string, projectId: string | null): Promise<Board> =>
  request(`${path(id)}/boards`, json('POST', { title, projectId }))

/**
 * Moves a board: a personal one into the workspace, a board of a workspace into another of its projects, or with a
 * `null` workspace out of it into the personal boards of the user.
 */
export const moveBoardToWorkspace = (boardId: string, workspaceId: string | null, projectId: string | null = null): Promise<Board> =>
  request(`/api/boards/${encodeURIComponent(boardId)}/workspace`, json('PUT', { workspaceId, projectId }))

/** The user needs an account of GitHub or Google for this: guests have no workspaces. */
export const isAccountRequired = (error: unknown) =>
  error instanceof HttpError && error.status === 403 && error.problem?.title === 'Account required'

/** The limit that a change of a workspace ran into, e.g. the most workspaces of a user; `null` for any other failure. */
export function workspaceLimitOf(error: unknown): { limit: number; scope: string | undefined } | null {
  if (!(error instanceof HttpError) || error.status !== 409 || error.problem?.limit === undefined) return null
  return { limit: error.problem.limit, scope: error.problem.scope }
}

/** The change would leave the workspace without an owner. */
export const isLastOwner = (error: unknown) =>
  error instanceof HttpError && error.status === 409 && error.problem?.title === 'Last owner'

/** The workspace has a project of that name already. */
export const isProjectNameTaken = (error: unknown) =>
  error instanceof HttpError && error.status === 409 && error.problem?.title === 'Project name taken'
