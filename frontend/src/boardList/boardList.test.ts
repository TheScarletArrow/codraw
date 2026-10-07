import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ListedBoard } from '../api/boards.ts'
import { HttpError } from '../api/http.ts'
import {
  addTag,
  ALL_FOLDERS,
  boardTime,
  collectTags,
  DEFAULT_BOARD_SORT,
  filterBoards,
  folderErrorMessage,
  highlightMatch,
  isFiltering,
  readBoardSort,
  saveBoardSort,
  sortBoards,
  tagErrorMessage,
  tagSuggestions,
  textQueryOf,
  titleMatches,
  type BoardFilter,
} from './boardList.ts'

const board = (id: string, title: string, fields: Partial<ListedBoard> = {}): ListedBoard => ({
  id,
  title,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-02T12:00:00Z',
  linkAccess: 'edit',
  owner: { id: 'alice', name: 'Алиса', avatarUrl: null },
  role: 'owner',
  openedAt: null,
  tags: [],
  folderId: null,
  ...fields,
})

const titles = (boards: ListedBoard[]) => boards.map((one) => one.title)

const filter = (fields: Partial<BoardFilter>): BoardFilter => ({ query: '', tags: [], folder: ALL_FOLDERS, ...fields })

describe('sortBoards', () => {
  const boards = [
    board('a', 'Склад', { updatedAt: '2026-10-03T00:00:00Z', openedAt: '2026-10-05T00:00:00Z' }),
    board('b', 'Схема 10', { updatedAt: '2026-10-05T00:00:00Z' }),
    board('c', 'Ёлка', { updatedAt: '2026-10-01T00:00:00Z', openedAt: '2026-10-06T00:00:00Z' }),
    board('d', 'Архив', { updatedAt: '2026-10-04T00:00:00Z' }),
    board('e', 'Схема 2', { updatedAt: '2026-10-02T00:00:00Z' }),
  ]

  it('orders by title by the Russian alphabet, numbers by their value', () => {
    expect(titles(sortBoards(boards, 'title'))).toEqual(['Архив', 'Ёлка', 'Склад', 'Схема 2', 'Схема 10'])
  })

  it('puts the latest opened first and boards never opened last, the latest changed first among them', () => {
    expect(titles(sortBoards(boards, 'opened'))).toEqual(['Ёлка', 'Склад', 'Схема 10', 'Архив', 'Схема 2'])
  })

  it('puts the latest changed first, and keeps the order of boards changed at once', () => {
    expect(titles(sortBoards(boards, 'changed'))).toEqual(['Схема 10', 'Архив', 'Склад', 'Схема 2', 'Ёлка'])
    expect(titles(sortBoards([board('x', 'Б'), board('y', 'А')], 'changed'))).toEqual(['Б', 'А'])
  })

  it('does not change the list it gets', () => {
    sortBoards(boards, 'title')

    expect(titles(boards)[0]).toBe('Склад')
  })
})

describe('boardTime', () => {
  it('shows when the board was opened in the order of opening, else when it changed', () => {
    const opened = board('a', 'A', { openedAt: '2026-10-05T00:00:00Z' })

    expect(boardTime(opened, 'opened')).toEqual({ at: '2026-10-05T00:00:00Z', label: 'Открыта' })
    expect(boardTime(board('b', 'B'), 'opened')).toEqual({ at: null, label: 'Открыта' })
    expect(boardTime(opened, 'title')).toEqual({ at: '2026-10-02T12:00:00Z', label: 'Изменена' })
    expect(boardTime(opened, 'changed').label).toBe('Изменена')
  })
})

describe('the order in the browser', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('is remembered', () => {
    saveBoardSort('title')

    expect(readBoardSort()).toBe('title')
  })

  it('is the default one when nothing or something unknown is remembered', () => {
    expect(readBoardSort()).toBe(DEFAULT_BOARD_SORT)
    localStorage.setItem('codraw.boards.sort', 'size')
    expect(readBoardSort()).toBe(DEFAULT_BOARD_SORT)
  })

  it('works without the storage of the browser', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })

    expect(() => saveBoardSort('title')).not.toThrow()
    expect(readBoardSort()).toBe(DEFAULT_BOARD_SORT)
  })
})

describe('filterBoards', () => {
  const boards = [
    board('a', 'Платёжный сервис', { tags: ['Бэкенд', 'Архив'], folderId: 'work' }),
    board('b', 'Склад', { tags: ['Бэкенд'] }),
    board('c', 'Схема заказов', { folderId: 'home' }),
  ]

  it('keeps boards whose title has the query in any case, with «ё» as «е» and spaces as one', () => {
    expect(titles(filterBoards(boards, filter({ query: '  ПЛАТЕЖ ' }), null))).toEqual(['Платёжный сервис'])
    expect(titles(filterBoards(boards, filter({ query: 'платежный   сервис' }), null))).toEqual(['Платёжный сервис'])
    expect(titles(filterBoards(boards, filter({ query: '   ' }), null))).toHaveLength(3)
  })

  it('keeps boards in whose text the backend found the query', () => {
    const found = new Map([['b', 'таблица orders']])

    expect(titles(filterBoards(boards, filter({ query: 'orders' }), found))).toEqual(['Склад'])
  })

  it('keeps boards that have all the chosen tags, in any case', () => {
    expect(titles(filterBoards(boards, filter({ tags: ['бэкенд'] }), null))).toEqual(['Платёжный сервис', 'Склад'])
    expect(titles(filterBoards(boards, filter({ tags: ['Бэкенд', 'Архив'] }), null))).toEqual(['Платёжный сервис'])
  })

  it('keeps the boards of a folder, or those in no folder', () => {
    expect(titles(filterBoards(boards, filter({ folder: { kind: 'folder', id: 'home' } }), null))).toEqual(['Схема заказов'])
    expect(titles(filterBoards(boards, filter({ folder: { kind: 'unfiled' } }), null))).toEqual(['Склад'])
    expect(titles(filterBoards(boards, filter({ folder: { kind: 'folder', id: 'gone' } }), null))).toEqual([])
  })

  it('combines the query, the tags and the folder', () => {
    const chosen = filter({ query: 'с', tags: ['Бэкенд'], folder: { kind: 'unfiled' } })

    expect(titles(filterBoards(boards, chosen, null))).toEqual(['Склад'])
    expect(isFiltering(chosen)).toBe(true)
    expect(isFiltering(filter({ query: ' ' }))).toBe(false)
  })
})

describe('search queries', () => {
  it('searches the texts of boards from two letters', () => {
    expect(textQueryOf(' к ')).toBe('')
    expect(textQueryOf(' Ёж ')).toBe('еж')
  })

  it('finds titles as the search on a board does', () => {
    expect(titleMatches('Ёлка\nновогодняя', 'елка новогодняя')).toBe(true)
    expect(titleMatches('Склад', 'склады')).toBe(false)
  })

  it('splits a fragment around the match, as it is written', () => {
    expect(highlightMatch('…поле Email_Confirmed boolean', 'email')).toEqual({
      before: '…поле ',
      match: 'Email',
      after: '_Confirmed boolean',
    })
    expect(highlightMatch('Ёлка', 'елк')).toEqual({ before: '', match: 'Ёлк', after: 'а' })
    expect(highlightMatch('Склад', 'заказ')).toBeNull()
  })
})

describe('tags', () => {
  it('are collected from all boards once regardless of case, by the alphabet', () => {
    const boards = [board('a', 'A', { tags: ['Бэкенд', 'api'] }), board('b', 'B', { tags: ['бэкенд', 'Архив'] })]

    // The Russian alphabet puts Cyrillic letters before Latin ones.
    expect(collectTags(boards)).toEqual(['Архив', 'Бэкенд', 'api'])
  })

  it('are added trimmed, once regardless of case, as the user wrote them before', () => {
    expect(addTag(['Бэкенд'], '  Два   слова ')).toEqual(['Бэкенд', 'Два слова'])
    expect(addTag(['Бэкенд'], 'бэкенд')).toEqual(['Бэкенд'])
    expect(addTag([], 'api', ['API'])).toEqual(['API'])
    expect(addTag(['A'], '   ')).toEqual(['A'])
  })

  it('are suggested from those of the user that the board has not, starting with the input first', () => {
    const known = ['Архив', 'Бэкенд', 'Поиск архивов', 'Срочно']

    expect(tagSuggestions(known, ['Срочно'], 'арх')).toEqual(['Архив', 'Поиск архивов'])
    expect(tagSuggestions(known, ['архив'], '')).toEqual(['Бэкенд', 'Поиск архивов', 'Срочно'])
  })
})

describe('messages of refusals', () => {
  it('name the limit of tags of a board or of the user', () => {
    expect(tagErrorMessage(new HttpError(409, { limit: 10, scope: 'board' }))).toBe('У доски может быть не больше 10 тегов')
    expect(tagErrorMessage(new HttpError(409, { limit: 21, scope: 'board' }))).toBe('У доски может быть не больше 21 тега')
    expect(tagErrorMessage(new HttpError(409, { limit: 50, scope: 'user' }))).toBe('Можно завести не больше 50 разных тегов')
    expect(tagErrorMessage(new HttpError(500))).toBe('Не удалось изменить теги')
  })

  it('name a taken name of a folder and the limit of folders', () => {
    expect(folderErrorMessage(new HttpError(409, { title: 'Folder name taken' }), 'rename')).toBe(
      'Папка с таким названием уже есть',
    )
    expect(folderErrorMessage(new HttpError(409, { limit: 50 }), 'create')).toBe('Можно завести не больше 50 папок')
    expect(folderErrorMessage(new HttpError(500), 'create')).toBe('Не удалось создать папку')
    expect(folderErrorMessage(new HttpError(500), 'rename')).toBe('Не удалось переименовать папку')
  })
})
