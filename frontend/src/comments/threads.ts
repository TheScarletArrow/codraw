import type { CommentThread, Person, ThreadPoint } from '../api/comments.ts'
import type { CellKind } from '../diagram/model.ts'

/**
 * What the panel shows: open threads, resolved threads, the threads that mention the current user or those assigned
 * to them.
 */
export type ThreadFilter = 'open' | 'resolved' | 'mentions' | 'assigned'

export const threadsKey = (boardId: string) => ['threads', boardId] as const

export const peopleKey = (boardId: string) => ['people', boardId] as const

export const isOpen = (thread: CommentThread) => thread.resolvedAt === null

/**
 * A request to show threads: those of an element, e.g. from its badge on the canvas, or one thread, e.g. from a
 * notification.
 */
export type ThreadFocus = { pageId: string; cellId: string } | { threadId: string }

/** Whether the thread is one of those that the focus asks to show. */
export function isFocused(thread: CommentThread, focus: ThreadFocus | null): boolean {
  if (!focus) return false
  return 'threadId' in focus ? thread.id === focus.threadId : thread.pageId === focus.pageId && thread.cellId === focus.cellId
}

/** The filter that shows the focused threads: a resolved thread is among the resolved ones only. */
export function filterFor(focus: ThreadFocus, threads: CommentThread[] | undefined): ThreadFilter {
  const thread = 'threadId' in focus ? threads?.find((candidate) => candidate.id === focus.threadId) : undefined
  return thread && !isOpen(thread) ? 'resolved' : 'open'
}

export const mentionsUser = (thread: CommentThread, userId: string) =>
  thread.comments.some((comment) => comment.mentions.some((person) => person.id === userId))

export const isAssignedTo = (thread: CommentThread, userId: string) => thread.assignee?.id === userId

export function filterThreads(threads: CommentThread[], filter: ThreadFilter, userId: string): CommentThread[] {
  switch (filter) {
    case 'open':
      return threads.filter(isOpen)
    case 'resolved':
      return threads.filter((thread) => !isOpen(thread))
    case 'mentions':
      return threads.filter((thread) => mentionsUser(thread, userId))
    case 'assigned':
      return threads.filter((thread) => isAssignedTo(thread, userId))
  }
}

export interface PageGroup {
  /** `null` for the threads of pages deleted since. */
  pageId: string | null
  title: string
  threads: CommentThread[]
}

/** Threads by page: the current page first, then the others in their order, then those of deleted pages. */
export function groupByPage(
  threads: CommentThread[],
  pages: { id: string; name: string }[],
  currentPageId: string | null,
): PageGroup[] {
  const ordered = [...pages].sort((a, b) => Number(b.id === currentPageId) - Number(a.id === currentPageId))
  const groups: PageGroup[] = ordered.flatMap((page) => {
    const onPage = threads.filter((thread) => thread.pageId === page.id)
    return onPage.length > 0 ? [{ pageId: page.id, title: page.name, threads: onPage }] : []
  })
  const known = new Set(pages.map((page) => page.id))
  const orphaned = threads.filter((thread) => !known.has(thread.pageId))
  if (orphaned.length > 0) groups.push({ pageId: null, title: 'Удалённые страницы', threads: orphaned })
  return groups
}

/** The number of open threads of each element of the page. */
export function openThreadsByCell(threads: CommentThread[], pageId: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const thread of threads) {
    if (thread.pageId === pageId && thread.cellId !== null && isOpen(thread)) {
      counts.set(thread.cellId, (counts.get(thread.cellId) ?? 0) + 1)
    }
  }
  return counts
}

/** A thread that stands at a point of its page. */
export type ThreadAtPoint = CommentThread & { point: ThreadPoint }

/** The threads of the page that stand at points, the open ones, and the resolved ones too with `withResolved`. */
export function threadsAtPoints(threads: CommentThread[], pageId: string, withResolved: boolean): ThreadAtPoint[] {
  return threads.filter(
    (thread): thread is ThreadAtPoint => thread.pageId === pageId && thread.point !== null && (withResolved || isOpen(thread)),
  )
}

export const commentTimeFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' })

/** An element of a page that a thread is about, as the board document has it. */
export interface CellInfo {
  kind: CellKind
  /** The label as one short line, empty when there is none. */
  label: string
}

/** What a thread is about, as its header says it; `cell` is `null` when the page no longer has the element. */
export function threadTarget(
  thread: Pick<CommentThread, 'cellId' | 'point'> & Partial<Pick<CommentThread, 'decisionId'>>,
  cell: CellInfo | null,
): { label: string; deleted: boolean } {
  if (thread.decisionId) return { label: 'Обсуждение решения', deleted: false }
  if (thread.point) return { label: 'Место на холсте', deleted: false }
  if (thread.cellId === null) return { label: 'Вся страница', deleted: false }
  if (!cell) return { label: 'Элемент удалён', deleted: true }
  if (cell.label !== '') return { label: `«${cell.label}»`, deleted: false }
  return { label: cell.kind === 'edge' ? 'Связь без подписи' : 'Элемент без подписи', deleted: false }
}

/** The label of an element as one short line: without markup, the first line, shortened. */
export function cellLabel(value: string, maxLength = 40): string {
  const text = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
  const line = text.split('\n').map((part) => part.trim()).find((part) => part !== '') ?? ''
  return line.length > maxLength ? `${line.slice(0, maxLength - 1)}…` : line
}

/** `@` and the letters typed after it, right before the caret. */
export interface MentionQuery {
  /** The index of `@` in the text. */
  start: number
  query: string
}

const normalize = (text: string) => text.toLocaleLowerCase('ru').replaceAll('ё', 'е')

/** The mention being typed before the caret: `@` at the start of the text or after a space, then no space. */
export function mentionQueryAt(text: string, caret: number): MentionQuery | null {
  const match = /(?:^|\s)@([^\s@]{0,40})$/.exec(text.slice(0, caret))
  return match ? { start: caret - match[1]!.length - 1, query: match[1]! } : null
}

/** People whose name, or a word of it, starts with the query; all of them for an empty query. */
export function suggestPeople(people: Person[], query: string, limit = 6): Person[] {
  const wanted = normalize(query)
  return people
    .filter((person) => {
      const name = normalize(person.name)
      return name.startsWith(wanted) || name.split(/\s+/).some((word) => word.startsWith(wanted))
    })
    .slice(0, limit)
}

/** Replaces the mention being typed with `@Name` and a space; returns the text and the caret after the space. */
export function insertMention(
  text: string,
  mention: MentionQuery,
  caret: number,
  person: Person,
): { text: string; caret: number } {
  const inserted = `@${person.name} `
  const rest = text.slice(caret).replace(/^ /, '')
  return { text: text.slice(0, mention.start) + inserted + rest, caret: mention.start + inserted.length }
}

/** Where `@Name` of a person stands in the text: not followed by another letter or digit. */
function mentionPattern(name: string): RegExp {
  return new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu')
}

/** The ids of the people whose `@Name` the text still has. */
export function mentionsIn(text: string, people: Iterable<Person>): string[] {
  const ids = new Set<string>()
  for (const person of people) if (mentionPattern(person.name).test(text)) ids.add(person.id)
  return [...ids]
}

export interface TextSegment {
  text: string
  /** The person the segment mentions, as `@Name`. */
  mention?: Person
}

/** The text cut into plain parts and the `@Name` of the mentioned people, for highlighting them. */
export function mentionSegments(body: string, mentions: Person[]): TextSegment[] {
  // Longer names first, so that «@Анна Мария» wins over «@Анна».
  const found: { index: number; length: number; person: Person }[] = []
  for (const person of [...mentions].sort((a, b) => b.name.length - a.name.length)) {
    for (const match of body.matchAll(mentionPattern(person.name))) {
      const index = match.index
      const overlaps = found.some((other) => index < other.index + other.length && other.index < index + match[0].length)
      if (!overlaps) found.push({ index, length: match[0].length, person })
    }
  }
  found.sort((a, b) => a.index - b.index)
  const segments: TextSegment[] = []
  let position = 0
  for (const { index, length, person } of found) {
    if (index > position) segments.push({ text: body.slice(position, index) })
    segments.push({ text: body.slice(index, index + length), mention: person })
    position = index + length
  }
  if (position < body.length) segments.push({ text: body.slice(position) })
  return segments
}
