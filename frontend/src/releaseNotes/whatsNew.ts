import { perLocale } from '../i18n/i18n.ts'
import { keepsLocalCopies } from '../offline/localCopies.ts'
import { releases, type Release } from './releases.ts'

/** The newest version whose novelties this browser has shown. */
const LAST_SEEN_KEY = 'codraw.whats-new.last-seen'

/** Compares two `major.minor.patch` versions: negative when `a` is older than `b`, zero when they are the same. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] || 0) - (right[i] || 0)
    if (difference !== 0) return difference
  }
  return 0
}

/**
 * The releases to show once when the app opens, newest first: those newer than the version last seen. A browser that has
 * seen none is either new to CoDraw, which needs no list of novelties, or was used before the list existed, which gets
 * the newest release.
 */
export function unseenReleases(lastSeen: string | null, usedBefore: boolean, all: Release[] = releases): Release[] {
  if (lastSeen === null) return usedBefore ? all.slice(0, 1) : []
  return all.filter((release) => compareVersions(release.version, lastSeen) > 0)
}

/** The version last seen in this browser; a browser that keeps no data for the site has seen none. */
function readLastSeen(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_KEY)
  } catch {
    return null
  }
}

/** The releases this browser has not shown yet; see {@link unseenReleases}. */
export function releasesToShow(): Release[] {
  return unseenReleases(readLastSeen(), keepsLocalCopies())
}

/** Records that this browser has shown the newest release. */
export function markReleasesSeen() {
  try {
    localStorage.setItem(LAST_SEEN_KEY, releases[0].version)
  } catch {
    // The browser keeps no data for the site: the novelties are not shown again only within this page.
  }
}

const dayFormat = perLocale((tag) => new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', year: 'numeric' }))

/** `6 октября 2026` or `October 6, 2026` for `2026-10-06`, in the language of the interface. */
export function releaseDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const parts = dayFormat().formatToParts(new Date(year, month - 1, day))
  // Up to the year: Russian adds «г.» after it, which a date in a heading does without.
  const end = parts.findIndex((part) => part.type === 'year') + 1
  return parts
    .slice(0, end)
    .map((part) => part.value)
    .join('')
}
