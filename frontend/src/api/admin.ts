import type { LinkAccess } from './boards.ts'
import type { ReportReason } from './publicBoards.ts'
import { request } from './http.ts'

/** A user as the administration names them. */
export interface UserRef {
  id: string
  name: string
}

/** A user as administrators find them. */
export interface AdminUser {
  id: string
  name: string
  avatarUrl: string | null
  provider: string
  providerUserId: string
  guest: boolean
  /** The configuration makes the user an administrator, whom nobody blocks. */
  admin: boolean
  createdAt: string
  /** `null` while the user is not blocked. */
  blockedAt: string | null
  /** Their boards outside the trash. */
  boards: number
}

/** A board as administrators find it, in the trash too. */
export interface AdminBoard {
  id: string
  title: string
  owner: UserRef
  linkAccess: LinkAccess
  embed: boolean
  sharingBlocked: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  openReports: number
}

export interface ReportedBoard {
  id: string
  title: string
  owner: UserRef
  linkAccess: LinkAccess
  sharingBlocked: boolean
  deletedAt: string | null
}

export interface BoardReport {
  id: string
  board: ReportedBoard
  reason: ReportReason
  message: string
  /** The signed-in user who sent it; `null` for a reader without a sign-in. */
  reporter: UserRef | null
  createdAt: string
  resolvedAt: string | null
  /** The name of the administrator who closed it. */
  resolvedBy: string | null
}

/** Everything administrators know of a board besides its content. */
export interface AdminBoardDetails {
  board: AdminBoard
  workspace: { id: string; name: string } | null
  sizes: { document: number; versions: number; versionCount: number; images: number; imageCount: number }
  /** The live image; `null` when it is off. */
  embed: { path: string; updatedAt: string | null } | null
  /** Open reports, the oldest first. */
  reports: BoardReport[]
}

export type AdminActionKind =
  | 'block-user'
  | 'unblock-user'
  | 'delete-user'
  | 'block-sharing'
  | 'unblock-sharing'
  | 'trash-board'
  | 'resolve-reports'

/** An entry of the journal of administrators. */
export interface AdminAction {
  id: string
  adminId: string
  adminName: string
  action: AdminActionKind
  targetKind: 'user' | 'board'
  targetId: string
  targetLabel: string
  details: string | null
  createdAt: string
}

const query = (text: string) => (text ? `?query=${encodeURIComponent(text)}` : '')
const post = <T>(path: string): Promise<T> => request(path, { method: 'POST' })
const remove = <T>(path: string): Promise<T> => request(path, { method: 'DELETE' })

export const adminKey = (...parts: string[]) => ['admin', ...parts] as const

export const findUsers = (text: string): Promise<AdminUser[]> => request(`/api/admin/users${query(text)}`)
export const blockUser = (id: string): Promise<AdminUser> => post(`/api/admin/users/${id}/block`)
export const unblockUser = (id: string): Promise<AdminUser> => remove(`/api/admin/users/${id}/block`)
/** Deletes the account with its boards; 409 with `reason` = `sole-workspace-owner` while it is the only owner of a workspace. */
export const deleteUser = (id: string): Promise<void> => remove(`/api/admin/users/${id}`)

export const findBoards = (text: string): Promise<AdminBoard[]> => request(`/api/admin/boards${query(text)}`)
export const fetchAdminBoard = (id: string): Promise<AdminBoardDetails> => request(`/api/admin/boards/${id}`)
export const blockSharing = (id: string): Promise<AdminBoardDetails> => post(`/api/admin/boards/${id}/sharing-block`)
export const unblockSharing = (id: string): Promise<AdminBoardDetails> => remove(`/api/admin/boards/${id}/sharing-block`)
export const trashBoard = (id: string): Promise<AdminBoardDetails> => post(`/api/admin/boards/${id}/trash`)
export const resolveReportsOf = (id: string): Promise<{ resolved: number }> => post(`/api/admin/boards/${id}/reports/resolve`)

export const fetchReports = (status: 'open' | 'resolved'): Promise<BoardReport[]> => request(`/api/admin/reports?status=${status}`)
export const resolveReport = (id: string): Promise<BoardReport> => post(`/api/admin/reports/${id}/resolve`)

export const fetchActions = (): Promise<AdminAction[]> => request('/api/admin/actions')
