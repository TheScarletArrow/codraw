import { tagLimitOf, type ListedBoard } from '../api/boards.ts'
import { folderLimitOf, isFolderNameTaken } from '../api/folders.ts'
import { searchText } from '../diagram/canvasSearch.ts'
import { boardListMessages as m } from './messages.ts'

/** How the list of boards is ordered: by when the user opened a board, by title, or by when it changed. */
export type BoardSort = 'opened' | 'title' | 'changed'

const SORTS: readonly BoardSort[] = ['opened', 'title', 'changed']

/** The orders the user chooses from, with their names in the language of the page. */
export const boardSorts = (): { value: BoardSort; label: string }[] => SORTS.map((value) => ({ value, label: m.sorts[value] }))

/** The order of the list until the user chooses another one, as the backend gives own boards. */
export const DEFAULT_BOARD_SORT: BoardSort = 'changed'

/** Where the browser keeps the order the user chose. */
const SORT_KEY = 'codraw.boards.sort'

/** The order the user chose in this browser; the default one when the browser keeps no data for the site. */
export function readBoardSort(): BoardSort {
  try {
    const stored = localStorage.getItem(SORT_KEY)
    return SORTS.find((sort) => sort === stored) ?? DEFAULT_BOARD_SORT
  } catch {
    return DEFAULT_BOARD_SORT
  }
}

/** Remembers the order in this browser. */
export function saveBoardSort(sort: BoardSort) {
  try {
    localStorage.setItem(SORT_KEY, sort)
  } catch {
    // The browser keeps no data for the site: the order holds while the page is open.
  }
}

/** Titles by the Russian alphabet, «ё» with «е», numbers by their value: «Схема 2» before «Схема 10». */
const titleOrder = new Intl.Collator('ru', { numeric: true })

const time = (at: string | null) => (at === null ? Number.NEGATIVE_INFINITY : Date.parse(at))

/**
 * The boards in the `sort` order: the latest opened first, boards never opened last; by title; or the latest changed
 * first. Boards equal in it keep the order they come in.
 */
export function sortBoards<T extends ListedBoard>(boards: T[], sort: BoardSort): T[] {
  const compare: Record<BoardSort, (a: T, b: T) => number> = {
    opened: (a, b) => time(b.openedAt) - time(a.openedAt) || time(b.updatedAt) - time(a.updatedAt),
    title: (a, b) => titleOrder.compare(a.title, b.title),
    changed: (a, b) => time(b.updatedAt) - time(a.updatedAt),
  }
  // Two boards never opened differ by Infinity - Infinity, which is NaN: they are equal there.
  return boards.toSorted((a, b) => compare[sort](a, b) || 0)
}

/** The time a row of a board shows: the one the list is ordered by; `null` for a board never opened. */
export function boardTime(board: ListedBoard, sort: BoardSort): { at: string | null; label: string } {
  return sort === 'opened' ? { at: board.openedAt, label: m.opened } : { at: board.updatedAt, label: m.changed }
}

/** Which boards the folder filter keeps: all, those in no folder, or those in one folder. */
export type FolderFilter = { kind: 'all' } | { kind: 'unfiled' } | { kind: 'folder'; id: string }

export const ALL_FOLDERS: FolderFilter = { kind: 'all' }

export interface BoardFilter {
  /** What the search field holds, as typed. */
  query: string
  /** Tags that a board must all have. */
  tags: string[]
  folder: FolderFilter
}

/** Whether the filter leaves out any board. */
export const isFiltering = (filter: BoardFilter) =>
  searchQueryOf(filter.query) !== '' || filter.tags.length > 0 || filter.folder.kind !== 'all'

/** A query as the search compares it, as the search on a board does; empty for a blank one. */
export const searchQueryOf = (query: string) => searchText(query).trim()

/** The shortest query searched for in the texts of boards: a single letter is in almost every board. */
export const TEXT_SEARCH_MIN_LENGTH = 2

/** The query to search for in the texts of boards; empty for one too short. */
export function textQueryOf(query: string): string {
  const wanted = searchQueryOf(query)
  return wanted.length >= TEXT_SEARCH_MIN_LENGTH ? wanted : ''
}

/** Whether the title has the query, in any case and with «ё» as «е»; any title has a blank query. */
export const titleMatches = (title: string, query: string) => searchText(title).includes(searchQueryOf(query))

/** Two tags or two names of folders are the same regardless of case. */
export const sameLabel = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/**
 * The boards that the filter keeps: the title has the query, or the backend found it in the text of the board
 * (`textMatches` by board id), the board has all the tags, and it is in the folder.
 */
export function filterBoards<T extends ListedBoard>(
  boards: T[],
  filter: BoardFilter,
  textMatches: ReadonlyMap<string, string> | null,
): T[] {
  return boards.filter(
    (board) =>
      (titleMatches(board.title, filter.query) || (textMatches?.has(board.id) ?? false)) &&
      filter.tags.every((tag) => board.tags.some((own) => sameLabel(own, tag))) &&
      inFolder(board, filter.folder),
  )
}

function inFolder(board: ListedBoard, folder: FolderFilter): boolean {
  if (folder.kind === 'all') return true
  if (folder.kind === 'unfiled') return board.folderId === null
  return board.folderId === folder.id
}

/** The tags of the user on all the boards, each once regardless of case, by the Russian alphabet. */
export function collectTags(boards: ListedBoard[]): string[] {
  const tags = new Map<string, string>()
  for (const board of boards) {
    for (const tag of board.tags) {
      if (!tags.has(tag.toLowerCase())) tags.set(tag.toLowerCase(), tag)
    }
  }
  return Array.from(tags.values()).sort(titleOrder.compare)
}

/** Sorts names of folders and tags by the Russian alphabet. */
export const byName = <T extends { name: string }>(items: T[]): T[] =>
  items.toSorted((a, b) => titleOrder.compare(a.name, b.name))

/** The longest tag the backend keeps. */
export const TAG_MAX_LENGTH = 30

/** The longest name of a folder the backend keeps. */
export const FOLDER_NAME_MAX_LENGTH = 60

/** A tag or the name of a folder as the backend keeps it: trimmed, a run of spaces inside as one. */
export const normalizeLabel = (label: string) => label.trim().replace(/\s+/g, ' ')

/**
 * The tags of a board with `tag` added at the end, written as the user wrote it on another board when they did (`known`);
 * the same tags for a blank tag or one the board has.
 */
export function addTag(tags: string[], tag: string, known: string[] = []): string[] {
  const added = normalizeLabel(tag)
  if (!added || tags.some((own) => sameLabel(own, added))) return tags
  return [...tags, known.find((other) => sameLabel(other, added)) ?? added]
}

/** The most tags the editor suggests at a time. */
const SUGGESTIONS = 8

/** Tags of the user (`known`) that the board has not, which have what is typed (`input`), those starting with it first. */
export function tagSuggestions(known: string[], tags: string[], input: string): string[] {
  const typed = searchQueryOf(input)
  const candidates = known.filter((tag) => !tags.some((own) => sameLabel(own, tag)) && searchText(tag).includes(typed))
  const starting = candidates.filter((tag) => searchText(tag).startsWith(typed))
  return [...starting, ...candidates.filter((tag) => !starting.includes(tag))].slice(0, SUGGESTIONS)
}

/**
 * A fragment of the text of a board split around the first match of the query, compared as the search does; `null`
 * when it has none there.
 */
export function highlightMatch(fragment: string, query: string): { before: string; match: string; after: string } | null {
  const wanted = searchQueryOf(query)
  // Lower case and «ё» as «е», letter by letter, keep the places of the letters.
  const compared = fragment.toLowerCase().replace(/ё/g, 'е')
  const at = wanted && compared.length === fragment.length ? compared.indexOf(wanted) : -1
  if (at < 0) return null
  return { before: fragment.slice(0, at), match: fragment.slice(at, at + wanted.length), after: fragment.slice(at + wanted.length) }
}

/** Why the tags of a board did not change, in words. */
export function tagErrorMessage(error: unknown): string {
  const reached = tagLimitOf(error)
  if (!reached) return m.tagsFailed
  return reached.scope === 'board' ? m.boardTagLimit(reached.limit) : m.userTagLimit(reached.limit)
}

/** Why a folder was not created or renamed, in words. */
export function folderErrorMessage(error: unknown, action: 'create' | 'rename'): string {
  if (isFolderNameTaken(error)) return m.folderTaken
  const limit = folderLimitOf(error)
  if (limit !== null) return m.folderLimit(limit)
  return action === 'create' ? m.createFolderFailed : m.renameFolderFailed
}
