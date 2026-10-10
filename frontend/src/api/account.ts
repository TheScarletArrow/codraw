import { request, requestBytes } from './http.ts'

/** A member of a board, to whom the board may pass when its owner deletes their account. */
export interface BoardMember {
  id: string
  name: string
  avatarUrl: string | null
  role: 'editor' | 'viewer'
}

/** A personal board that others work on too: deleting the account needs a decision about it. */
export interface SharedBoard {
  id: string
  title: string
  members: BoardMember[]
  /** How many others opened it through its link without being its members. */
  visitors: number
}

/** What deleting the account of the user would do. */
export interface DeletionPreview {
  sharedBoards: SharedBoard[]
  /** Workspaces whose only owner the user is while others are members: the role passes on first. */
  blockingWorkspaces: { id: string; name: string }[]
  /** Boards that go without a question: those without others and those in the trash. */
  deletedBoards: number
}

/** What becomes of a board with others: it passes to one of its members, or goes. */
export type BoardDecision = { boardId: string; action: 'transfer'; newOwnerId: string } | { boardId: string; action: 'delete' }

export const DELETION_PREVIEW_KEY = ['account', 'deletion'] as const

export function fetchDeletionPreview(): Promise<DeletionPreview> {
  return request('/api/me/deletion')
}

/** Deletes the account of the signed-in user for good and ends all their sessions. */
export function deleteAccount(boards: BoardDecision[]): Promise<void> {
  return request('/api/me', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ boards }),
  })
}

/** A board of the user as the export lists it. */
export interface ExportedBoard {
  id: string
  title: string
  deletedAt: string | null
}

/** Everything the server keeps of the user, a key per part; the boards are listed, their documents come apart. */
export type ExportedData = Record<string, unknown> & { boards: ExportedBoard[]; templates: { title: string; drawio: string }[] }

/** The data of the user for their archive; the server lets a user have it a few times a day. */
export function exportData(): Promise<ExportedData> {
  return request('/api/me/export', { method: 'POST' })
}

/** The stored document of a board of the user, empty while it has none. */
export function exportBoardDocument(boardId: string): Promise<Uint8Array> {
  return requestBytes(`/api/me/export/boards/${encodeURIComponent(boardId)}`)
}
