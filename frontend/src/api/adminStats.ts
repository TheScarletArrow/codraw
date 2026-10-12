import { request } from './http.ts'

/** Users with a day of activity in the last `days` days, accounts and guests apart. */
export interface ActiveUsers {
  days: number
  accounts: number
  guests: number
}

/** What happened in the last `days` days. */
export interface PeriodStats {
  days: number
  /** Accounts, not guests, created in the period. */
  newAccounts: number
  /** Guests who signed in with a provider in their session. */
  guestConversions: number
  /** Boards that users changed on at least one day of the period. */
  editedBoards: number
  /** Of those, boards that two users or more could edit at the same time on a day they changed. */
  coEditedBoards: number
}

/** Accounts created from `from` to `to` and those of them who came back 7 to 13 days after they were created. */
export interface Cohort {
  from: string
  to: string
  accounts: number
  returned: number
  /** `false` while the days that tell who came back were not collected yet. */
  complete: boolean
}

/** The statistics of the installation on `date` (UTC); a period of N days is that day and the N − 1 before it. */
export interface ProductStats {
  date: string
  /** The first day of activity collected; `null` while there is none. */
  collectedSince: string | null
  /** For 1, 7 and 28 days. */
  activeUsers: ActiveUsers[]
  /** For 7 and 28 days. */
  periods: PeriodStats[]
  /** The four weekly cohorts of new accounts, the latest first. */
  cohorts: Cohort[]
}

export const STATS_KEY = ['admin', 'stats'] as const

export const fetchStats = (): Promise<ProductStats> => request('/api/admin/stats')
