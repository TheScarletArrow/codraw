import { HttpError, request } from './http.ts'

/** A personal folder of boards of the current user; nobody else sees it. */
export interface BoardFolder {
  id: string
  name: string
}

/** Query key of the folders of the user. */
export const FOLDERS_QUERY_KEY = ['board-folders'] as const

const folderPath = (id: string) => `/api/boards/folders/${encodeURIComponent(id)}`

/** The folders of the current user, by name. */
export function fetchFolders(): Promise<BoardFolder[]> {
  return request('/api/boards/folders')
}

export function createFolder(name: string): Promise<BoardFolder> {
  return request('/api/boards/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export function renameFolder(id: string, name: string): Promise<BoardFolder> {
  return request(folderPath(id), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

/** Deletes a folder of the user; its boards stay, in no folder. */
export function deleteFolder(id: string): Promise<void> {
  return request(folderPath(id), { method: 'DELETE' })
}

/** The most folders a user has, when creating one ran into it; `null` for any other failure. */
export function folderLimitOf(error: unknown): number | null {
  return error instanceof HttpError && error.status === 409 ? (error.problem?.limit ?? null) : null
}

/** The user has a folder of that name already, regardless of case. */
export const isFolderNameTaken = (error: unknown) =>
  error instanceof HttpError && error.status === 409 && error.problem?.limit === undefined
