import { HttpError, request } from './http.ts'

/**
 * What the user may do on a board: its owner manages it, anybody else edits it or only views it, by the higher of their
 * role as a member and what the link of the board gives.
 */
export type BoardRole = 'owner' | 'editor' | 'viewer'

/**
 * What a link to a board gives to users other than its owner and its members: nothing, viewing, viewing by anybody
 * without a sign-in too, or editing.
 */
export type LinkAccess = 'none' | 'view' | 'public' | 'edit'

/**
 * What the workspace of a board gives its editors and viewers on it: their roles, viewing, or nothing. Owners and
 * administrators of the workspace manage its boards whatever it is.
 */
export type WorkspaceAccess = 'none' | 'view' | 'edit'

/** The workspace that a board belongs to. */
export interface BoardWorkspace {
  id: string
  name: string
}

export interface BoardOwner {
  id: string
  name: string
  avatarUrl: string | null
}

export interface Board {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  linkAccess: LinkAccess
  owner: BoardOwner
  /** The role of the current user. */
  role: BoardRole
  /** The workspace of the board; `null` for a personal board, missing in the lists of boards. */
  workspace?: BoardWorkspace | null
  /** The project of its workspace that the board is in. */
  projectId?: string | null
  /** What the workspace gives its editors and viewers on the board. */
  workspaceAccess?: WorkspaceAccess
}

/** A board in a list of boards of the current user, with how the user organized it: only they see it. */
export interface ListedBoard extends Board {
  /**
   * When the user last opened the board: when they were last on their own board, when they opened a shared one; `null`
   * while they never did.
   */
  openedAt: string | null
  /** The personal tags of the user on the board. */
  tags: string[]
  /** The personal folder of the user that the board is in; `null` for none. */
  folderId: string | null
}

/** A board of another user that the current user is a member of or opened through its link. */
export type SharedBoard = ListedBoard

/** Query key of the boards of the user. */
export const OWN_BOARDS_QUERY_KEY = ['boards'] as const

/** Query key of the boards of other users that are shared with the user. */
export const SHARED_BOARDS_QUERY_KEY = ['shared-boards'] as const

/** Where a board of the text search was found: the line of its text around the match. */
export interface BoardTextMatch {
  boardId: string
  fragment: string
}

/** Short-lived token that lets the user connect to the shared document of one board. */
export interface CollabToken {
  token: string
  expiresAt: string
}

/** The boards of the current user, most recently changed first. */
export function fetchBoards(): Promise<ListedBoard[]> {
  return request('/api/boards')
}

/** Boards of other users that the current user is a member of or opened, the most recently opened or joined first. */
export function fetchSharedBoards(): Promise<SharedBoard[]> {
  return request('/api/boards/shared')
}

export function fetchBoard(id: string): Promise<Board> {
  return request(`/api/boards/${encodeURIComponent(id)}`)
}

/**
 * The most boards a user owns, when creating a board failed because the user owns as many already; `null` for any
 * other failure.
 */
export function boardLimitOf(error: unknown): number | null {
  return error instanceof HttpError && error.status === 409 ? (error.problem?.limit ?? null) : null
}

export function createBoard(title: string): Promise<Board> {
  return request('/api/boards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

/** Renames a board of the current user. */
export function renameBoard(id: string, title: string): Promise<Board> {
  return request(`/api/boards/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

/** Sets what the link to a board of the current user gives to others. */
export function changeLinkAccess(id: string, linkAccess: LinkAccess): Promise<Board> {
  return request(`/api/boards/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ linkAccess }),
  })
}

/** Sets what the workspace of a board gives its editors and viewers on it. */
export function changeWorkspaceAccess(id: string, workspaceAccess: WorkspaceAccess): Promise<Board> {
  return request(`/api/boards/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceAccess }),
  })
}

/** The user may change the document of the board. */
export const canEdit = (board: Pick<Board, 'role'>) => board.role !== 'viewer'

/**
 * The user sees, saves, names and restores the versions of the board: whoever edits it may wreck it, so they may bring
 * it back too. The backend checks the same.
 */
export const canManageVersions = (board: Pick<Board, 'role'>) => canEdit(board)

/** Gives a board of the list of the user their tags instead of those it had; answers the tags as they are kept. */
export function setBoardTags(id: string, tags: string[]): Promise<{ tags: string[] }> {
  return request(`/api/boards/${encodeURIComponent(id)}/tags`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  })
}

/** Puts a board of the list of the user into their folder, or with `null` into none. */
export function moveBoard(id: string, folderId: string | null): Promise<void> {
  return request(`/api/boards/${encodeURIComponent(id)}/folder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderId }),
  })
}

/** The limit of tags that a change ran into: of one board or of all tags of the user; `null` for any other failure. */
export function tagLimitOf(error: unknown): { limit: number; scope: 'board' | 'user' } | null {
  if (!(error instanceof HttpError) || error.status !== 409 || error.problem?.limit === undefined) return null
  return { limit: error.problem.limit, scope: error.problem.scope === 'user' ? 'user' : 'board' }
}

/** Boards that the user can open whose text has the query, with where it was found. */
export function searchBoards(query: string, signal?: AbortSignal): Promise<BoardTextMatch[]> {
  return request(`/api/boards/search?q=${encodeURIComponent(query)}`, { signal })
}

/** Moves a board to the trash for 30 days: of its owner, and of those who manage its workspace. */
export function deleteBoard(id: string): Promise<void> {
  return request(`/api/boards/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export interface TrashedBoard {
  id: string
  title: string
  deletedAt: string
  expiresAt: string
  /** The workspace that the board belongs to; `null` for a personal board. */
  workspace?: BoardWorkspace | null
}

export const TRASH_QUERY_KEY = ['board-trash'] as const
export const fetchTrash = (): Promise<TrashedBoard[]> => request('/api/boards/trash')
export const restoreTrashedBoard = (id: string): Promise<Board> =>
  request(`/api/boards/trash/${encodeURIComponent(id)}/restore`, { method: 'POST' })
export const purgeTrashedBoard = (id: string): Promise<void> =>
  request(`/api/boards/trash/${encodeURIComponent(id)}`, { method: 'DELETE' })

export function fetchCollabToken(boardId: string): Promise<CollabToken> {
  return request(`/api/boards/${encodeURIComponent(boardId)}/collab-token`, { method: 'POST' })
}
