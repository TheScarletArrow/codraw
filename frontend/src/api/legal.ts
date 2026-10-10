import { request } from './http.ts'

/** Who provides this installation of CoDraw, and how long it keeps data. */
export interface LegalInfo {
  /** `null` when the deployment does not name its operator. */
  operator: string | null
  contactEmail: string | null
  guestBoardRetentionDays: number
  guestSessionDays: number
  versionsPerBoard: number
  /** A notification is deleted once it is this many days old. */
  notificationRetentionDays: number
  /** The most notifications kept of a user. */
  notificationsPerUser: number
  /** The most closed proposals of changes kept of a board. */
  closedProposalsPerBoard: number
  /** Whether users may read schemas of databases through the server, with the user and the password of a database. */
  schemaImport: boolean
  /** Entries of the journal of administrators and closed reports of boards are deleted once they are this many days old. */
  adminRetentionDays: number
  /** Whether users may connect GitHub with a token of theirs and link its issues to elements and threads of boards. */
  issues: boolean
}

export function fetchLegal(): Promise<LegalInfo> {
  return request('/api/legal')
}
