export interface Board {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export class HttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Request failed with status ${status}`)
    this.name = 'HttpError'
    this.status = status
  }
}

export const isNotFound = (error: unknown) => error instanceof HttpError && error.status === 404

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { Accept: 'application/json', ...init.headers },
  })
  if (!response.ok) {
    throw new HttpError(response.status)
  }
  return (await response.json()) as T
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
