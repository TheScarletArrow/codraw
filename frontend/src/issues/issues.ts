import { HttpError } from '../api/http.ts'
import type { IssueLink, IssueTarget } from '../api/issues.ts'

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
  if (link.state === 'open') return 'Открыта'
  switch (link.stateReason) {
    case 'not-planned':
      return 'Закрыта: не планируется'
    case 'duplicate':
      return 'Закрыта: дубликат'
    default:
      return 'Закрыта: выполнена'
  }
}

/** Why the link may be out of date, `null` when it is not. */
export function syncProblem(link: IssueLink): string | null {
  switch (link.sync) {
    case 'ok':
      return null
    case 'deleted':
      return 'Задача удалена в GitHub'
    case 'no-access':
      return link.linkedBy
        ? `Нет доступа: задачу удалили или перенесли, либо подключение привязавшего её участника (${link.linkedBy.name}) больше её не видит`
        : 'Нет доступа к задаче'
    case 'disconnected':
      return link.linkedBy
        ? `Не обновляется: у привязавшего задачу участника (${link.linkedBy.name}) нет рабочего подключения к GitHub`
        : 'Не обновляется: привязавший задачу участник удалён'
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
  if (!(error instanceof HttpError)) return `${fallback} — проверьте соединение`
  switch (error.problem?.reason) {
    case 'not-connected':
      return 'Подключите GitHub в настройках подключений'
    case 'token-rejected':
      return 'GitHub больше не принимает ваш токен — подключите GitHub заново'
    case 'invalid-token':
      return 'GitHub не принял токен'
    case 'not-found':
      return 'Не найдено: такой задачи нет или ваш токен не даёт к ней доступа'
    case 'issue-deleted':
      return 'Задача удалена в GitHub'
    case 'not-an-issue':
      return 'Это pull request, а не задача'
    case 'tracker-forbidden':
      return 'Токену не хватает прав: нужен доступ «Issues: Read and write» к репозиторию'
    case 'tracker-rejected':
      return 'GitHub не принял задачу: возможно, задачи в репозитории выключены'
    case 'tracker-unavailable':
      return 'GitHub не отвечает — попробуйте позже'
    case 'creation-in-progress':
      return 'Задача уже создаётся — подождите немного'
    case 'forbidden':
      return 'Привязывать задачи к элементам могут владелец и редакторы доски'
    case 'guest':
      return 'Задачи GitHub доступны после входа через GitHub или Google'
    case 'tracker-off':
      return 'На этом сервере задачи GitHub не подключены'
    case 'limit':
      return `На доске уже ${error.problem.limit ?? 'много'} привязанных задач — больше нельзя`
    case 'no-thread':
      return 'Ветка удалена'
    case 'no-link':
      return 'Привязка уже удалена'
    default:
      return fallback
  }
}
