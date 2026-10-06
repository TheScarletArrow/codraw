import { request, requestBytes } from './http.ts'
import type { VersionAuthor } from './versions.ts'

/** The version that the changes since a visit start from: about the board as the user left it. */
export interface VisitBaseline {
  id: string
  createdAt: string
}

/** What changed on a board since the previous visit of the current user. */
export interface ChangesSinceVisit {
  /** When the previous visit ended; `null` during the first visit. */
  since: string | null
  /** Other participants whose changes the comparison with the baseline shows, in the order of their first change. */
  authors: VersionAuthor[]
  /** The version to compare the board with; `null` when nothing changed or the board has no version to compare with. */
  baseline: VisitBaseline | null
}

const visitPath = (boardId: string) => `/api/boards/${encodeURIComponent(boardId)}/visit`

/**
 * The page opened the board: the visit of the user begins, or goes on while another page of theirs is on the board.
 * Answers what changed since the previous visit.
 */
export function startVisit(boardId: string): Promise<ChangesSinceVisit> {
  return request(visitPath(boardId), { method: 'POST' })
}

/**
 * Tells that the page is on the board, or with `left` that it left it. Such a report outlives the page that sends it
 * while closing.
 */
export function reportVisit(boardId: string, left = false): Promise<void> {
  return request(visitPath(boardId), { method: left ? 'DELETE' : 'PUT', keepalive: true })
}

/** The state of the version that the current visit compares the board with, which every participant gets. */
export function fetchVisitBaseline(boardId: string): Promise<Uint8Array> {
  return requestBytes(`${visitPath(boardId)}/baseline`)
}
