import { request, requestBytes } from './http.ts'

/** Why a version was saved: by the backend before a change, by the owner, or by the owner's page before a restore. */
export type VersionReason = 'auto' | 'manual' | 'restore'

/** A saved earlier state of the document of a board; only its owner sees them. */
export interface BoardVersion {
  id: string
  createdAt: string
  reason: VersionReason
}

const versionsPath = (boardId: string) => `/api/boards/${encodeURIComponent(boardId)}/versions`

/** Versions of a board of the current user, most recent first. */
export function fetchVersions(boardId: string): Promise<BoardVersion[]> {
  return request(versionsPath(boardId))
}

/** The state of the board document saved in a version. */
export function fetchVersionState(boardId: string, versionId: string): Promise<Uint8Array> {
  return requestBytes(`${versionsPath(boardId)}/${encodeURIComponent(versionId)}`)
}

/** Saves a state of the board document as a version. */
export function saveVersion(
  boardId: string,
  state: Uint8Array,
  reason: Exclude<VersionReason, 'auto'>,
): Promise<BoardVersion> {
  return request(`${versionsPath(boardId)}?reason=${reason}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    // A copy backed by a plain ArrayBuffer, which is what fetch accepts as a body.
    body: new Uint8Array(state),
  })
}
