import { HttpError } from '../api/http.ts'
import type { IssueLink, IssueTarget } from '../api/issues.ts'
import { issueMessages as m } from './messages.ts'

/** The links of all boards, e.g. after the user changed the connection that keeps theirs up to date. */
export const ISSUE_LINKS_KEY = ['issue-links'] as const

export const issueLinksKey = (boardId: string) => [...ISSUE_LINKS_KEY, boardId] as const

export const TRACKER_SETTINGS_KEY = ['issue-tracker'] as const

export const TRACKER_REPOSITORIES_KEY = ['issue-tracker', 'repositories'] as const

/** Where the user connects the tracker. */
export const CONNECTIONS_PATH = '/settings/connections'

/** A link shown longer than this after CoDraw last asked the tracker is brought up to date when it is shown. */
export const STALE_AFTER_MS = 5 * 60_000

/** Whether the link is of the target. */
export function isOf(link: IssueLink, target: IssueTarget): boolean {
  return 'threadId' in target
    ? link.threadId === target.threadId
    : link.threadId === null && link.pageId === target.pageId && link.cellId === target.cellId
}

/** The links of each element of the page, by its cell, in the order they were linked. */
export function linksByCell(links: readonly IssueLink[], pageId: string): Map<string, IssueLink[]> {
  const byCell = new Map<string, IssueLink[]>()
  for (const link of links) {
    if (link.pageId !== pageId || link.cellId === null) continue
    byCell.set(link.cellId, [...(byCell.get(link.cellId) ?? []), link])
  }
  return byCell
}

/** The links that are worth asking the tracker about now: shown for a while since, and kept up to date by somebody. */
export function staleLinks(links: readonly IssueLink[], now: number): IssueLink[] {
  return links.filter(
    (link) =>
      (link.sync === 'ok' || link.sync === 'no-access') && now - new Date(link.syncedAt).getTime() > STALE_AFTER_MS,
  )
}

/** The state of the issue in the words of GitHub. */
export function stateLabel(link: Pick<IssueLink, 'state' | 'stateReason'>): string {
  if (link.state === 'open') return m.state.open
  switch (link.stateReason) {
    case 'not-planned':
      return m.state.notPlanned
    case 'duplicate':
      return m.state.duplicate
    default:
      return m.state.completed
  }
}

/** Why the link may be out of date, `null` when it is not. */
export function syncProblem(link: IssueLink): string | null {
  switch (link.sync) {
    case 'ok':
      return null
    case 'deleted':
      return m.sync.deleted
    case 'no-access':
      return link.linkedBy
        ? m.sync.noAccessBy(link.linkedBy.name)
        : m.sync.noAccess
    case 'disconnected':
      return link.linkedBy
        ? m.sync.disconnectedBy(link.linkedBy.name)
        : m.sync.disconnected
  }
}

/** `owner/name#12` of the issue. */
export const issueReference = (link: Pick<IssueLink, 'repository' | 'number'>) => `${link.repository}#${link.number}`

/** Only an address of a page opens from CoDraw: never `javascript:` or the like. */
export const isWebUrl = (url: string) => /^https?:\/\//i.test(url)

const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/

/** Whether the text is `owner/name` of a repository. */
export const isRepository = (text: string) => REPOSITORY.test(text) && !['.', '..'].includes(text.split('/')[1])

/**
 * The issue that the text names: the address of its page (`https://github.com/owner/name/issues/12`), `owner/name#12`,
 * or `#12` and `12` in the [repository] at hand; `null` for anything else, e.g. words to search for.
 */
export function parseIssueReference(text: string, repository: string | null): { repository: string; number: number } | null {
  const trimmed = text.trim()
  const page = /^https?:\/\/[^/]+\/([^/]+\/[^/]+)\/issues\/(\d+)\/?(?:[?#].*)?$/i.exec(trimmed)
  const reference = /^([^\s#]+\/[^\s#]+)#(\d+)$/.exec(trimmed)
  const local = /^#?(\d+)$/.exec(trimmed)
  const [name, number] = page ? [page[1], page[2]] : reference ? [reference[1], reference[2]] : local ? [repository, local[1]] : []
  if (!name || !number || !isRepository(name)) return null
  const value = Number(number)
  return Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647 ? { repository: name, number: value } : null
}

/** What to tell the user when a request about issues failed. */
export function issueErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpError)) return m.errors.offline(fallback)
  switch (error.problem?.reason) {
    case 'not-connected':
      return m.errors.notConnected
    case 'token-rejected':
      return m.errors.tokenRejected
    case 'invalid-token':
      return m.errors.invalidToken
    case 'not-found':
      return m.errors.notFound
    case 'issue-deleted':
      return m.errors.issueDeleted
    case 'not-an-issue':
      return m.errors.notAnIssue
    case 'tracker-forbidden':
      return m.errors.trackerForbidden
    case 'tracker-rejected':
      return m.errors.trackerRejected
    case 'tracker-unavailable':
      return m.errors.trackerUnavailable
    case 'creation-in-progress':
      return m.errors.creationInProgress
    case 'forbidden':
      return m.errors.forbidden
    case 'guest':
      return m.errors.guest
    case 'tracker-off':
      return m.errors.trackerOff
    case 'limit':
      return m.errors.limit(error.problem.limit)
    case 'no-thread':
      return m.errors.noThread
    case 'no-link':
      return m.errors.noLink
    default:
      return fallback
  }
}
