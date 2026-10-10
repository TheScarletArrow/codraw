import { useEffect, useRef, useState } from 'react'
import { reportVisit, startVisit, type ChangesSinceVisit } from '../api/visits.ts'
import type { VersionAuthor } from '../api/versions.ts'
import { perLocale } from '../i18n/i18n.ts'
import { changeMessages as m } from './changes.messages.ts'

/** How often a page in sight tells that the user is on the board; the backend waits twice as long before it doubts it. */
export const VISIT_REPORT_INTERVAL_MS = 60_000

/** Query key of the state that the visit since `since` compares the board with: a new visit has a baseline of its own. */
export const visitBaselineKey = (boardId: string, since: string) => ['boards', boardId, 'visit', since, 'baseline'] as const

/**
 * The visit of the user to a board while its page is open. Begins it once per board and answers what changed since the
 * previous visit: `null` until then, and when it failed. Then, while the page shows the board (`shown`), it tells the
 * backend that the user is on the board every {@link VISIT_REPORT_INTERVAL_MS} while the tab is in sight and whenever the
 * tab is shown again, and that they left when the page is closed, the user goes elsewhere in the app or the page no
 * longer shows the board, e.g. as the owner closed it.
 *
 * A tab that gets hidden reports nothing: closing or reloading the page hides it right before or after `pagehide`, and a
 * report of presence sent then could reach the backend after the one of leaving and keep the visit going.
 */
export function useBoardVisit(boardId: string, shown = true): ChangesSinceVisit | null {
  const [visit, setVisit] = useState<{ boardId: string; changes: ChangesSinceVisit | null } | null>(null)
  const started = useRef<string | null>(null)
  useEffect(() => {
    // Effects run twice in development: the second run must not begin another visit, which would end this one at once.
    if (started.current === boardId) return
    started.current = boardId
    startVisit(boardId).then(
      (changes) => setVisit({ boardId, changes }),
      () => setVisit({ boardId, changes: null }),
    )
  }, [boardId])

  // Reports begin once the visit has: an earlier report could get ahead of it and end the previous visit just now.
  const reporting = visit?.boardId === boardId && shown
  useEffect(() => {
    if (!reporting) return
    const report = (left = false) => void reportVisit(boardId, left).catch(() => {})
    let timer: ReturnType<typeof setInterval> | undefined
    // Only a tab in sight reports: the user does not see the board in a hidden one, so the last report before it got
    // hidden tells when they saw it.
    const schedule = () => {
      clearInterval(timer)
      timer = document.visibilityState === 'visible' ? setInterval(() => report(), VISIT_REPORT_INTERVAL_MS) : undefined
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') report()
      schedule()
    }
    const onPageHide = () => report(true)
    schedule()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
      report(true)
    }
  }, [boardId, reporting])

  return visit?.boardId === boardId ? visit.changes : null
}

/** Authors the banner names; the others are counted. */
const NAMED_AUTHORS = 3

/** «Аня», «Аня и Боб», «Аня, Боб и Вера», «Аня, Боб, Вера и ещё 2». */
export function authorNames(authors: VersionAuthor[]): string {
  const names = authors.map((author) => author.name)
  if (names.length > NAMED_AUTHORS) {
    return m.andMore(names.slice(0, NAMED_AUTHORS).join(', '), names.length - NAMED_AUTHORS)
  }
  return names.length > 1 ? m.and(names.slice(0, -1).join(', '), names.at(-1)!) : (names[0] ?? '')
}

const timeFormat = perLocale((tag) => new Intl.DateTimeFormat(tag, { hour: 'numeric', minute: '2-digit' }))
const dayFormat = perLocale((tag) => new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long' }))
const dateFormat = perLocale((tag) => new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', year: 'numeric' }))

const DAY_MS = 24 * 60 * 60 * 1000

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

/** When a visit ended, by the calendar of the user: «сегодня в 9:15», «вчера в 18:40», «3 октября в 18:40». */
export function visitTime(at: Date, now = new Date()): string {
  const time = timeFormat().format(at)
  // Rounding the difference of two midnights keeps a day a day across a change of the clock.
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS)
  if (days === 0) return m.today(time)
  if (days === 1) return m.yesterday(time)
  return m.onDay((at.getFullYear() === now.getFullYear() ? dayFormat : dateFormat)().format(at), time)
}
