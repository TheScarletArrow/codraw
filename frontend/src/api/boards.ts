import { request } from './http.ts'

export interface Board {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

/** Short-lived token that lets the user connect to the shared document of one board. */
export interface CollabToken {
  token: string
  expiresAt: string
}

export function fetchBoards(): Promise<Board[]> {
  return request('/api/boards')
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

export function fetchCollabToken(boardId: string): Promise<CollabToken> {
  return request(`/api/boards/${encodeURIComponent(boardId)}/collab-token`, { method: 'POST' })
}
