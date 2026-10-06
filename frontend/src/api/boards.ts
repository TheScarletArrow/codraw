import { HttpError, request } from './http.ts'

/**
 * What the user may do on a board: its owner manages it, anybody else edits it or only views it, by the higher of their
 * role as a member and what the link of the board gives.
 */
export type BoardRole = 'owner' | 'editor' | 'viewer'

/** What a link to a board gives to users other than its owner and its members: nothing, viewing or editing. */
export type LinkAccess = 'none' | 'view' | 'edit'

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
}

/** A board of another user that the current user is a member of or opened through its link. */
export interface SharedBoard extends Board {
  /** When the user last opened it; `null` for a board they are a member of and never opened. */
  openedAt: string | null
}

/** Query key of the boards of other users that are shared with the user. */
export const SHARED_BOARDS_QUERY_KEY = ['shared-boards'] as const

/** Short-lived token that lets the user connect to the shared document of one board. */
export interface CollabToken {
  token: string
  expiresAt: string
}

export function fetchBoards(): Promise<Board[]> {
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

/** The user may change the document of the board. */
export const canEdit = (board: Pick<Board, 'role'>) => board.role !== 'viewer'

/**
 * The user sees, saves and restores the versions of the board: whoever edits it may wreck it, so they may bring it back
 * too.
 */
export const canManageVersions = (board: Pick<Board, 'role'>) => canEdit(board)

/** Deletes a board of the current user for good, with its document. */
export function deleteBoard(id: string): Promise<void> {
  return request(`/api/boards/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function fetchCollabToken(boardId: string): Promise<CollabToken> {
  return request(`/api/boards/${encodeURIComponent(boardId)}/collab-token`, { method: 'POST' })
}
