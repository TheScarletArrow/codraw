import { request, requestBytes } from './http.ts'

/** Why a version was saved: by the backend before a change, by the owner, or by the owner's page before a restore. */
export type VersionReason = 'auto' | 'manual' | 'restore'

/** A participant whose changes a version has since the version before it, as their account shows them now. */
export interface VersionAuthor {
  id: string
  name: string
  avatarUrl: string | null
}

/** A saved earlier state of the document of a board; only its owner sees them. */
export interface BoardVersion {
  id: string
  createdAt: string
  reason: VersionReason
  /** The name the owner or an editor gave the version, `null` when it has none. */
  name: string | null
  /** Who changed the board since the version before, in the order of their first change. */
  authors: VersionAuthor[]
}

/** The longest name of a version the backend accepts. */
export const VERSION_NAME_MAX_LENGTH = 100

const versionsPath = (boardId: string) => `/api/boards/${encodeURIComponent(boardId)}/versions`

/** Versions of a board of the current user, most recent first. */
export function fetchVersions(boardId: string): Promise<BoardVersion[]> {
  return request(versionsPath(boardId))
}

/** The state of the board document saved in a version. */
export function fetchVersionState(boardId: string, versionId: string): Promise<Uint8Array> {
  return requestBytes(`${versionsPath(boardId)}/${encodeURIComponent(versionId)}`)
}

/** Saves a state of the board document as a version, with a name if it is given. */
export function saveVersion(
  boardId: string,
  state: Uint8Array,
  reason: Exclude<VersionReason, 'auto'>,
  name?: string,
): Promise<BoardVersion> {
  // The body is the state, so the name goes in the address.
  const named = name ? `&name=${encodeURIComponent(name)}` : ''
  return request(`${versionsPath(boardId)}?reason=${reason}${named}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    // A copy backed by a plain ArrayBuffer, which is what fetch accepts as a body.
    body: new Uint8Array(state),
  })
}

/** Gives a version a new name; `null` takes its name away. */
export function renameVersion(boardId: string, versionId: string, name: string | null): Promise<BoardVersion> {
  return request(`${versionsPath(boardId)}/${encodeURIComponent(versionId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}
