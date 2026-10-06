import type { Board, BoardRole } from './boards.ts'
import { HttpError, request } from './http.ts'

/** The role that the owner gives a member of a board: editing or viewing. */
export type MemberRole = Exclude<BoardRole, 'owner'>

/** The owner or a member of a board, with the role of their own. */
export interface Participant {
  id: string
  name: string
  avatarUrl: string | null
  /** `owner` for the owner, the role the owner gave to a member. */
  role: BoardRole
}

/** A user who opened the board through its link and is not its member. */
export interface Visitor {
  id: string
  name: string
  avatarUrl: string | null
  visitedAt: string
}

/** An invitation link of a board: whoever opens it becomes a member with its role. */
export interface Invite {
  id: string
  /** The address of the invitation from the root of the site, e.g. `/invite/…`. */
  path: string
  role: MemberRole
  createdAt: string
}

const boardPath = (boardId: string) => `/api/boards/${encodeURIComponent(boardId)}`

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** The owner of the board first, then its members in the order they joined. */
export function fetchMembers(boardId: string): Promise<Participant[]> {
  return request(`${boardPath(boardId)}/members`)
}

/** Users who opened the board through its link and are not members yet; only the owner sees them. */
export function fetchVisitors(boardId: string): Promise<Visitor[]> {
  return request(`${boardPath(boardId)}/visitors`)
}

/** Gives a member another role, or makes a user who opened the board through its link a member. */
export function setMemberRole(boardId: string, userId: string, role: MemberRole): Promise<Participant> {
  return request(`${boardPath(boardId)}/members/${encodeURIComponent(userId)}`, json('PUT', { role }))
}

/** The user stops being a member: they keep what the link gives. */
export function removeMember(boardId: string, userId: string): Promise<void> {
  return request(`${boardPath(boardId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

/** Makes a member the owner; returns the board as its previous owner sees it, an editor now. */
export function transferOwnership(boardId: string, userId: string): Promise<Board> {
  return request(`${boardPath(boardId)}/owner`, json('PUT', { userId }))
}

/** The invitation links of the board, oldest first; only the owner sees them. */
export function fetchInvites(boardId: string): Promise<Invite[]> {
  return request(`${boardPath(boardId)}/invites`)
}

export function createInvite(boardId: string, role: MemberRole): Promise<Invite> {
  return request(`${boardPath(boardId)}/invites`, json('POST', { role }))
}

/** Revokes the invitation: its link stops working, and the members who joined through it stay. */
export function revokeInvite(boardId: string, inviteId: string): Promise<void> {
  return request(`${boardPath(boardId)}/invites/${encodeURIComponent(inviteId)}`, { method: 'DELETE' })
}

/** Accepts an invitation as the current user; returns the board with their role on it. */
export function acceptInvite(token: string): Promise<Board> {
  return request(`/api/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' })
}

/** The limit that the request ran into, e.g. the most members of a board; `null` for any other failure. */
export function limitOf(error: unknown): number | null {
  return error instanceof HttpError && error.status === 409 ? (error.problem?.limit ?? null) : null
}
