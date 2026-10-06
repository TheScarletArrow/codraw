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
}

export function fetchLegal(): Promise<LegalInfo> {
  return request('/api/legal')
}
