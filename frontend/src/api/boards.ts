import { request } from './http.ts'

/**
 * What the user may do on a board: its owner manages it, anybody else opened it through its link, which lets them edit
 * or only view it.
 */
export type BoardRole = 'owner' | 'editor' | 'viewer'

/** What a link to a board gives to users other than its owner: nothing, viewing or editing. */
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

/** A board of another user that the current user opened through its link. */
export interface SharedBoard extends Board {
  /** When the user last opened it. */
  openedAt: string
}

/** Short-lived token that lets the user connect to the shared document of one board. */
export interface CollabToken {
  token: string
  expiresAt: string
}

export function fetchBoards(): Promise<Board[]> {
  return request('/api/boards')
}

/** Boards of other users that the current user opened through their links, most recently opened first. */
export function fetchSharedBoards(): Promise<SharedBoard[]> {
  return request('/api/boards/shared')
}

export function fetchBoard(id: string): Promise<Board> {
  return request(`/api/boards/${encodeURIComponent(id)}`)
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

/** Deletes a board of the current user for good, with its document. */
export function deleteBoard(id: string): Promise<void> {
  return request(`/api/boards/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function fetchCollabToken(boardId: string): Promise<CollabToken> {
  return request(`/api/boards/${encodeURIComponent(boardId)}/collab-token`, { method: 'POST' })
}
