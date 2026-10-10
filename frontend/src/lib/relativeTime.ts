import { libMessages as m } from './messages.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * How long ago `time` was at `now`, both in milliseconds since the epoch, in the language of the interface: «только
 * что» (“just now”) within a minute, then whole minutes, hours, days, months of 30 days and years of 365 days. A time
 * ahead of `now`, e.g. from the clock of another computer, is «только что» too.
 */
export function relativeTime(time: number, now: number): string {
  const elapsed = now - time
  if (elapsed < MINUTE) return m.justNow
  if (elapsed < HOUR) return m.minutesAgo(Math.floor(elapsed / MINUTE))
  if (elapsed < DAY) return m.hoursAgo(Math.floor(elapsed / HOUR))
  const days = Math.floor(elapsed / DAY)
  if (days < 30) return m.daysAgo(days)
  const months = Math.floor(days / 30)
  if (months < 12) return m.monthsAgo(months)
  return m.yearsAgo(Math.max(1, Math.floor(days / 365)))
}
