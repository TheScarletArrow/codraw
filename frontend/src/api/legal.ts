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
  /** The most days that deleted data stays in backups, `null` when the installation makes none. */
  backupRetentionDays: number | null
  /** Whether backups are kept outside the server too, at a provider of storage of the operator. */
  backupOffsite: boolean
  /** The providers that users of this installation sign in through. */
  signInProviders: LegalSignInProvider[]
  /** Whether «Продолжить без входа» creates guests. */
  guests: boolean
}

export interface LegalSignInProvider {
  name: string
  /** A provider of OpenID Connect that the operator chose, not GitHub or Google. */
  corporate: boolean
}

export function fetchLegal(): Promise<LegalInfo> {
  return request('/api/legal')
}
