import type { BoardRole } from './boards.ts'
import { HttpError, request } from './http.ts'
import type { MemberRole, Participant } from './members.ts'

/** A request of a user for a role on a board, which waits for the owner to answer it. */
export interface AccessRequest {
  /** A new request of the same user gets a new id: the owner answers the request they saw. */
  id: string
  userId: string
  name: string
  avatarUrl: string | null
  /** The role the user asks for. */
  role: MemberRole
  /** What the user tells the owner. */
  message: string | null
  createdAt: string
}

/** The longest message to the owner that a request takes. */
export const MESSAGE_MAX_LENGTH = 500

const boardPath = (boardId: string) => `/api/boards/${encodeURIComponent(boardId)}`

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** The request of the current user for access to the board, `null` when they have none waiting for an answer. */
export async function fetchOwnAccessRequest(boardId: string): Promise<AccessRequest | null> {
  // The API answers 204 without a request.
  return (await request<AccessRequest | undefined>(`${boardPath(boardId)}/access-request`)) ?? null
}

/** Asks the owner for a role on the board, in place of an earlier request of the current user. */
export function requestAccess(boardId: string, role: MemberRole, message: string): Promise<AccessRequest> {
  return request(`${boardPath(boardId)}/access-request`, json('PUT', { role, message: message.trim() || null }))
}

/** The current user no longer asks for access to the board. */
export function cancelAccessRequest(boardId: string): Promise<void> {
  return request(`${boardPath(boardId)}/access-request`, { method: 'DELETE' })
}

/** The requests for access to the board that wait for an answer, oldest first; only the owner sees them. */
export function fetchAccessRequests(boardId: string): Promise<AccessRequest[]> {
  return request(`${boardPath(boardId)}/access-requests`)
}

/** Gives the user of the request a role, which makes them a member of the board; the request is answered. */
export function grantAccess(boardId: string, requestId: string, role: MemberRole): Promise<Participant> {
  return request(`${boardPath(boardId)}/access-requests/${encodeURIComponent(requestId)}/grant`, json('POST', { role }))
}

/** Declines the request; its user may ask again. */
export function declineAccessRequest(boardId: string, requestId: string): Promise<void> {
  return request(`${boardPath(boardId)}/access-requests/${encodeURIComponent(requestId)}`, { method: 'DELETE' })
}

/**
 * The role on the board that the current user has already, when they asked for it or for less; `null` for any other
 * failure.
 */
export function roleGivenOf(error: unknown): BoardRole | null {
  return error instanceof HttpError && error.status === 409 ? ((error.problem?.role as BoardRole | undefined) ?? null) : null
}
