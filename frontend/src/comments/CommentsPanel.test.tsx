import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import type { Comment, CommentThread, Person } from '../api/comments.ts'
import { deleteCell, getCells, initializeDocument, writeCell } from '../diagram/model.ts'
import { createQueryClient } from '../queryClient.ts'
import { mockFetch, type MockResponse } from '../test/render.tsx'
import { CommentsPanel, type ThreadDraft, type ThreadFocus } from './CommentsPanel.tsx'
import { useThreads } from './useComments.ts'

const boardId = '0199a000-0000-7000-8000-000000000001'
const threadsUrl = `/api/boards/${boardId}/threads`
const alice: Person = { id: 'alice', name: 'Алиса', avatarUrl: null }
const bob: Person = { id: 'bob', name: 'Боб', avatarUrl: null }
const pages = [
  { id: 'page-1', name: 'Обзор' },
  { id: 'page-2', name: 'Данные' },
]

const comment = (id: string, author: Person | null, body: string, mentions: Person[] = []): Comment => ({
  id,
  author,
  body,
  mentions,
  createdAt: '2026-10-05T10:00:00Z',
  editedAt: null,
})

const thread = (id: string, changes: Partial<CommentThread> = {}): CommentThread => ({
  id,
  pageId: 'page-1',
  cellId: 'api',
  createdAt: '2026-10-05T10:00:00Z',
  resolvedAt: null,
  resolvedBy: null,
  comments: [comment(`${id}-1`, bob, 'Почему без кэша?')],
  ...changes,
})

function boardDocument() {
  const document = new Y.Doc()
  initializeDocument(document)
  const cell = (id: string, kind: 'vertex' | 'edge', value: string) => ({
    id,
    kind,
    parent: '1',
    order: 'a0',
    value,
    geometry: null,
    source: null,
    target: null,
    style: {},
  })
  writeCell(getCells(document, 'page-1'), cell('api', 'vertex', 'API\n[Container]'))
  writeCell(getCells(document, 'page-1'), cell('link', 'edge', ''))
  return document
}

interface Setup {
  /** The threads, or the responses to the requests of the threads in order. */
  threads: CommentThread[] | MockResponse[]
  responses?: Record<string, MockResponse | MockResponse[]>
  userId?: string
  isOwner?: boolean
  draft?: ThreadDraft | null
  focus?: ThreadFocus | null
  document?: Y.Doc
}

function renderPanel({ threads, responses = {}, userId = 'alice', isOwner = true, draft = null, focus = null, document = boardDocument() }: Setup) {
  const fetchMock = mockFetch({
    [`GET ${threadsUrl}`]: threads.some((entry) => !('id' in entry)) ? (threads as MockResponse[]) : { body: threads },
    [`GET /api/boards/${boardId}/people`]: { body: [alice, bob] },
    ...responses,
  })
  const onShow = vi.fn()
  const onChanged = vi.fn()
  const onClose = vi.fn()
  function Panel() {
    const threads = useThreads(boardId)
    const [current, setDraft] = useState(draft)
    return (
      <CommentsPanel
        boardId={boardId}
        userId={userId}
        isOwner={isOwner}
        threads={threads.data}
        failed={threads.isError}
        pages={pages}
        currentPageId="page-1"
        document={document}
        draft={current}
        onDraftChange={setDraft}
        focus={focus}
        onShow={onShow}
        onChanged={onChanged}
        onClose={onClose}
      />
    )
  }
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 0 } })
  render(
    <QueryClientProvider client={queryClient}>
      <Panel />
    </QueryClientProvider>,
  )
  return { fetchMock, onShow, onChanged, onClose, document }
}

const requestsOf = (fetchMock: ReturnType<typeof mockFetch>, method: string, url: string) =>
  fetchMock.mock.calls.filter(([input, init]) => (init?.method ?? 'GET') === method && input.toString() === url)

const bodyOf = (fetchMock: ReturnType<typeof mockFetch>, method: string, url: string) =>
  JSON.parse(String(requestsOf(fetchMock, method, url).at(-1)![1]!.body))

describe('CommentsPanel', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the open threads by page, the current page first, named after their elements', async () => {
    renderPanel({
      threads: [
        thread('t1'),
        thread('t2', { pageId: 'page-2', cellId: null, comments: [comment('c2', alice, 'Про страницу')] }),
        thread('t3', { cellId: 'link' }),
        thread('t4', { resolvedAt: '2026-10-05T11:00:00Z' }),
      ],
    })

    const overview = await screen.findByRole('region', { name: 'Обзор' })
    expect(within(overview).getAllByRole('article').map((article) => article.getAttribute('aria-label'))).toEqual([
      'Ветка: «API»',
      'Ветка: Связь без подписи',
    ])
    const data = screen.getByRole('region', { name: 'Данные' })
    expect(within(data).getByRole('article', { name: 'Ветка: Вся страница' })).toHaveTextContent('Про страницу')
    expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual(['Обзор', 'Данные'])
  })

  it('marks the thread of a deleted element, and goes to an element by its thread', async () => {
    const { onShow, document } = renderPanel({ threads: [thread('t1')] })
    const card = await screen.findByRole('article', { name: 'Ветка: «API»' })

    await userEvent.click(within(card).getByRole('button', { name: '«API»' }))
    expect(onShow).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }))

    act(() => deleteCell(getCells(document, 'page-1'), 'api'))
    expect(await screen.findByRole('article', { name: 'Ветка: Элемент удалён' })).toBeInTheDocument()
  })

  it('switches between the open, the resolved and the threads that mention the user', async () => {
    renderPanel({
      threads: [
        thread('open'),
        thread('done', { resolvedAt: '2026-10-05T11:00:00Z', resolvedBy: bob, comments: [comment('d', bob, 'Готово')] }),
        thread('mention', { comments: [comment('m', bob, '@Алиса глянь', [alice])] }),
      ],
    })
    await screen.findAllByRole('article')

    await userEvent.click(screen.getByRole('button', { name: 'Решённые' }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('article')).toHaveTextContent('Решено: Боб')
    expect(screen.getByRole('button', { name: 'Решённые' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Упоминают меня' }))
    const mention = screen.getByRole('article')
    expect(mention).toHaveTextContent('@Алиса глянь')
    expect(within(mention).getByText('@Алиса')).toHaveAttribute('data-mention', 'alice')
  })

  it('says when there are no threads', async () => {
    renderPanel({ threads: [] })

    expect(await screen.findByText(/Открытых веток нет/)).toBeInTheDocument()
  })

  it('starts a thread about the element chosen on the canvas and tells the others', async () => {
    const created = thread('new', { comments: [comment('n', alice, 'Новая')] })
    const { fetchMock, onChanged } = renderPanel({
      threads: [{ body: [] }, { body: [created] }],
      draft: { pageId: 'page-1', cellId: 'api' },
      responses: { [`POST ${threadsUrl}`]: { status: 201, body: created } },
    })
    const draft = await screen.findByRole('group', { name: 'Новая ветка' })
    expect(draft).toHaveTextContent('Новая ветка: «API»')
    const field = within(draft).getByRole('combobox', { name: 'Новый комментарий' })
    await waitFor(() => expect(field).toHaveFocus())

    await userEvent.type(field, 'Новая{Enter}')

    await waitFor(() => expect(screen.queryByRole('group', { name: 'Новая ветка' })).toBeNull())
    expect(bodyOf(fetchMock, 'POST', threadsUrl)).toEqual({ pageId: 'page-1', cellId: 'api', body: 'Новая', mentions: [] })
    expect(onChanged).toHaveBeenCalled()
    expect(await screen.findByRole('article', { name: 'Ветка: «API»' })).toHaveTextContent('Новая')
  })

  it('starts a thread about the current page', async () => {
    renderPanel({ threads: [] })

    await userEvent.click(await screen.findByRole('button', { name: 'Комментарий к странице' }))

    expect(screen.getByRole('group', { name: 'Новая ветка' })).toHaveTextContent('Новая ветка: Вся страница')
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByRole('group', { name: 'Новая ветка' })).toBeNull()
  })

  it('answers in a thread with a mention', async () => {
    const { fetchMock } = renderPanel({
      threads: [thread('t1')],
      responses: { [`POST ${threadsUrl}/t1/comments`]: { status: 201, body: thread('t1') } },
    })
    const card = await screen.findByRole('article', { name: 'Ветка: «API»' })
    const answer = within(card).getByRole('combobox', { name: 'Ответ' })

    await userEvent.type(answer, '@Б')
    await userEvent.click(await screen.findByRole('option', { name: 'Боб' }))
    await userEvent.type(answer, 'кэш будет{Enter}')

    await waitFor(() => expect(requestsOf(fetchMock, 'POST', `${threadsUrl}/t1/comments`)).toHaveLength(1))
    expect(bodyOf(fetchMock, 'POST', `${threadsUrl}/t1/comments`)).toEqual({ body: '@Боб кэш будет', mentions: ['bob'] })
  })

  it('resolves a thread and opens it again', async () => {
    const resolved = thread('t1', { resolvedAt: '2026-10-05T11:00:00Z', resolvedBy: alice })
    const { fetchMock } = renderPanel({
      threads: [{ body: [thread('t1')] }, { body: [resolved] }],
      responses: { [`PATCH ${threadsUrl}/t1`]: { body: resolved } },
    })
    const card = await screen.findByRole('article', { name: 'Ветка: «API»' })

    await userEvent.click(within(card).getByRole('button', { name: 'Решено' }))

    expect(bodyOf(fetchMock, 'PATCH', `${threadsUrl}/t1`)).toEqual({ resolved: true })
    expect(await screen.findByText(/Открытых веток нет/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Решённые' }))
    await userEvent.click(screen.getByRole('button', { name: 'Открыть снова' }))
    expect(bodyOf(fetchMock, 'PATCH', `${threadsUrl}/t1`)).toEqual({ resolved: false })
  })

  it('lets the author change their comment', async () => {
    const mine = thread('t1', { comments: [comment('c1', alice, 'Чревовато')] })
    const { fetchMock } = renderPanel({
      threads: [mine],
      isOwner: false,
      responses: { [`PATCH ${threadsUrl}/t1/comments/c1`]: { body: mine } },
    })
    const card = await screen.findByRole('article')

    await userEvent.click(within(card).getByRole('button', { name: 'Изменить' }))
    const field = within(card).getByRole('combobox', { name: 'Текст комментария' })
    await userEvent.clear(field)
    await userEvent.type(field, 'Чревато{Enter}')

    expect(bodyOf(fetchMock, 'PATCH', `${threadsUrl}/t1/comments/c1`)).toEqual({ body: 'Чревато', mentions: [] })
    await waitFor(() => expect(within(card).queryByRole('combobox', { name: 'Текст комментария' })).toBeNull())
  })

  it('lets only the author or the owner delete a comment, asking first', async () => {
    const answered = thread('t1', { comments: [comment('c1', bob, 'Вопрос'), comment('c2', bob, 'Уточнение')] })
    const { fetchMock } = renderPanel({
      threads: [answered],
      responses: { [`DELETE ${threadsUrl}/t1/comments/c2`]: { status: 204 } },
    })
    const card = await screen.findByRole('article')
    expect(within(card).getAllByRole('listitem', { name: 'Комментарий: Боб' })).toHaveLength(2)
    expect(within(card).queryByRole('button', { name: 'Изменить' })).toBeNull()

    const [, deleteSecond] = within(card).getAllByRole('button', { name: 'Удалить' })
    await userEvent.click(deleteSecond!)
    const confirm = screen.getByRole('alertdialog', { name: 'Удаление комментария' })
    expect(confirm).toHaveTextContent('Удалить комментарий?')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(requestsOf(fetchMock, 'DELETE', `${threadsUrl}/t1/comments/c2`)).toHaveLength(1))
  })

  it('warns that deleting the first comment deletes the thread, and offers nothing on comments of others', async () => {
    renderPanel({ threads: [thread('t1')], isOwner: true })
    const card = await screen.findByRole('article')

    await userEvent.click(within(card).getByRole('button', { name: 'Удалить' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Удалить ветку со всеми ответами?')
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))

    vi.unstubAllGlobals()
    document.body.innerHTML = ''
    renderPanel({ threads: [thread('t1')], isOwner: false })
    const other = await screen.findByRole('article')
    expect(within(other).queryByRole('button', { name: 'Удалить' })).toBeNull()
    expect(within(other).queryByRole('button', { name: 'Изменить' })).toBeNull()
  })

  it('shows a deleted author as such', async () => {
    renderPanel({ threads: [thread('t1', { comments: [comment('c1', null, 'Я ушёл')] })] })

    expect(await screen.findByRole('listitem', { name: 'Комментарий: Удалённый пользователь' })).toHaveTextContent('Я ушёл')
  })

  it('highlights the threads of the element it was opened for', async () => {
    renderPanel({ threads: [thread('t1'), thread('t2', { cellId: 'link' })], focus: { pageId: 'page-1', cellId: 'link' } })

    const focused = await screen.findByRole('article', { name: 'Ветка: Связь без подписи' })
    expect(focused).toHaveClass('ring-2')
    expect(screen.getByRole('article', { name: 'Ветка: «API»' })).not.toHaveClass('ring-2')
  })

  it('says when the threads could not be loaded', async () => {
    renderPanel({ threads: [{ status: 500 }] })

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить комментарии')
  })
})
