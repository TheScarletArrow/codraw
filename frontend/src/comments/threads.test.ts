import { describe, expect, it } from 'vitest'
import type { Comment, CommentThread, Person } from '../api/comments.ts'
import {
  cellLabel,
  filterThreads,
  groupByPage,
  insertMention,
  mentionQueryAt,
  mentionSegments,
  mentionsIn,
  openThreadsByCell,
  suggestPeople,
  threadsAtPoints,
  threadTarget,
} from './threads.ts'

const alice: Person = { id: 'alice', name: 'Алиса', avatarUrl: null }
const bob: Person = { id: 'bob', name: 'Боб', avatarUrl: null }
const anna: Person = { id: 'anna', name: 'Анна Мария', avatarUrl: null }
const fedor: Person = { id: 'fedor', name: 'Фёдор', avatarUrl: null }

const comment = (body: string, mentions: Person[] = []): Comment => ({
  id: `comment-${body}`,
  author: alice,
  body,
  mentions,
  createdAt: '2026-10-05T10:00:00Z',
  editedAt: null,
})

const thread = (id: string, changes: Partial<CommentThread> = {}): CommentThread => ({
  id,
  pageId: 'page-1',
  cellId: 'cell-1',
  point: null,
  createdAt: '2026-10-05T10:00:00Z',
  resolvedAt: null,
  resolvedBy: null,
  comments: [comment(id)],
  ...changes,
})

describe('threads', () => {
  const open = thread('open')
  const resolved = thread('resolved', { resolvedAt: '2026-10-05T11:00:00Z', resolvedBy: bob })
  const mentioning = thread('mentioning', { resolvedAt: '2026-10-05T11:00:00Z', comments: [comment('@Боб', [bob])] })
  const all = [open, resolved, mentioning]

  it('filters the open, the resolved and those that mention the user, resolved or not', () => {
    expect(filterThreads(all, 'open', 'bob')).toEqual([open])
    expect(filterThreads(all, 'resolved', 'bob')).toEqual([resolved, mentioning])
    expect(filterThreads(all, 'mentions', 'bob')).toEqual([mentioning])
    expect(filterThreads(all, 'mentions', 'alice')).toEqual([])
  })

  it('groups threads by page, the current page first, then the others in order, then deleted pages', () => {
    const pages = [
      { id: 'page-1', name: 'Обзор' },
      { id: 'page-2', name: 'Данные' },
      { id: 'page-3', name: 'Пустая' },
    ]
    const first = thread('first')
    const second = thread('second', { pageId: 'page-2' })
    const orphan = thread('orphan', { pageId: 'gone' })

    expect(groupByPage([first, second, orphan], pages, 'page-2')).toEqual([
      { pageId: 'page-2', title: 'Данные', threads: [second] },
      { pageId: 'page-1', title: 'Обзор', threads: [first] },
      { pageId: null, title: 'Удалённые страницы', threads: [orphan] },
    ])
  })

  it('counts the open threads of each element of a page', () => {
    const counts = openThreadsByCell(
      [open, thread('again'), resolved, thread('page', { cellId: null }), thread('other', { pageId: 'page-2' })],
      'page-1',
    )

    expect([...counts]).toEqual([['cell-1', 2]])
  })

  it('takes the threads of the page at points, the resolved ones on request', () => {
    const point = { x: 1, y: 2 }
    const open = thread('open', { cellId: null, point })
    const resolved = thread('resolved', { cellId: null, point, resolvedAt: '2026-10-05T11:00:00Z' })
    const other = thread('other', { pageId: 'page-2', cellId: null, point })
    const threads = [open, resolved, thread('cell'), thread('page', { cellId: null }), other]

    expect(threadsAtPoints(threads, 'page-1', false)).toEqual([open])
    expect(threadsAtPoints(threads, 'page-1', true)).toEqual([open, resolved])
    expect(openThreadsByCell(threads, 'page-1')).toEqual(new Map([['cell-1', 1]]))
  })

  it('says what a thread is about: an element, a deleted one, a point or the page', () => {
    expect(threadTarget({ cellId: 'api', point: null }, { kind: 'vertex', label: 'API' })).toEqual({
      label: '«API»',
      deleted: false,
    })
    expect(threadTarget({ cellId: 'api', point: null }, null)).toEqual({ label: 'Элемент удалён', deleted: true })
    expect(threadTarget({ cellId: null, point: { x: 1, y: 2 } }, null)).toEqual({ label: 'Место на холсте', deleted: false })
    expect(threadTarget({ cellId: null, point: null }, null)).toEqual({ label: 'Вся страница', deleted: false })
  })

  it('names an element by the first line of its label, without markup', () => {
    expect(cellLabel('API\n[Container: Spring Boot]')).toBe('API')
    expect(cellLabel('<b>Заказы</b><br>сервис')).toBe('Заказы')
    expect(cellLabel('  \nВторая строка')).toBe('Вторая строка')
    expect(cellLabel('a &amp; b')).toBe('a & b')
    expect(cellLabel('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`)
    expect(cellLabel('')).toBe('')
  })
})

describe('mentions', () => {
  it('finds the mention being typed before the caret', () => {
    expect(mentionQueryAt('@', 1)).toEqual({ start: 0, query: '' })
    expect(mentionQueryAt('Привет, @Бо', 11)).toEqual({ start: 8, query: 'Бо' })
    expect(mentionQueryAt('Привет, @Бо и', 13)).toBeNull()
    expect(mentionQueryAt('почта a@b', 9)).toBeNull()
    expect(mentionQueryAt('@Боб текст', 4)).toEqual({ start: 0, query: 'Боб' })
  })

  it('suggests people by the beginning of their name or of a word of it, «ё» and «е» alike', () => {
    const people = [alice, bob, anna, fedor]

    expect(suggestPeople(people, '')).toEqual(people)
    expect(suggestPeople(people, 'а')).toEqual([alice, anna])
    expect(suggestPeople(people, 'мар')).toEqual([anna])
    expect(suggestPeople(people, 'федор')).toEqual([fedor])
    expect(suggestPeople(people, 'z')).toEqual([])
    expect(suggestPeople(people, '', 2)).toEqual([alice, bob])
  })

  it('writes the chosen person as @Name and a space in place of what was typed', () => {
    const text = 'Посмотри, @Бо пожалуйста'
    const mention = mentionQueryAt(text, 13)!

    expect(insertMention(text, mention, 13, bob)).toEqual({ text: 'Посмотри, @Боб пожалуйста', caret: 15 })
    expect(insertMention('@', { start: 0, query: '' }, 1, anna)).toEqual({ text: '@Анна Мария ', caret: 12 })
  })

  it('keeps the people whose @Name the text still has', () => {
    expect(mentionsIn('@Боб и @Анна Мария, гляньте', [bob, anna, alice])).toEqual(['bob', 'anna'])
    expect(mentionsIn('@Бобби', [bob])).toEqual([])
    expect(mentionsIn('Боб', [bob])).toEqual([])
  })

  it('cuts the text into plain parts and mentions, the longer name first', () => {
    const annaShort: Person = { id: 'a2', name: 'Анна', avatarUrl: null }

    expect(mentionSegments('Привет, @Анна Мария и @Боб!', [annaShort, anna, bob])).toEqual([
      { text: 'Привет, ' },
      { text: '@Анна Мария', mention: anna },
      { text: ' и ' },
      { text: '@Боб', mention: bob },
      { text: '!' },
    ])
    expect(mentionSegments('Без упоминаний', [bob])).toEqual([{ text: 'Без упоминаний' }])
  })
})
