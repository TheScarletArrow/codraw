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
import { CommentsPanel, type ThreadDraft } from './CommentsPanel.tsx'
import type { ThreadFocus } from './threads.ts'
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
  reactions: [],
  createdAt: '2026-10-05T10:00:00Z',
  editedAt: null,
})

const thread = (id: string, changes: Partial<CommentThread> = {}): CommentThread => ({
  id,
  pageId: 'page-1',
  cellId: 'api',
  point: null,
  decisionId: null,
  createdAt: '2026-10-05T10:00:00Z',
  resolvedAt: null,
  resolvedBy: null,
  assignee: null,
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
  /** A draft that the button «Другой черновик» puts in place of the current one, as the page of the board does. */
  nextDraft?: ThreadDraft
  focus?: ThreadFocus | null
  document?: Y.Doc
}

function renderPanel({
  threads,
  responses = {},
  userId = 'alice',
  isOwner = true,
  draft = null,
  nextDraft,
  focus = null,
  document = boardDocument(),
}: Setup) {
  const fetchMock = mockFetch({
    [`GET ${threadsUrl}`]: threads.some((entry) => !('id' in entry)) ? (threads as MockResponse[]) : { body: threads },
    [`GET /api/boards/${boardId}/people`]: { body: [alice, bob] },
    ...responses,
  })
  const onShow = vi.fn()
  const onChanged = vi.fn()
  const onClose = vi.fn()
  const onFilterChange = vi.fn()
  function Panel() {
    const threads = useThreads(boardId)
    const [current, setDraft] = useState(draft)
    return (
      <>
        {nextDraft && (
          <button type="button" onClick={() => setDraft(nextDraft)}>
            Другой черновик
          </button>
        )}
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
          onFilterChange={onFilterChange}
          onShow={onShow}
          onChanged={onChanged}
          onClose={onClose}
        />
      </>
    )
  }
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 0 } })
  render(
    <QueryClientProvider client={queryClient}>
      <Panel />
    </QueryClientProvider>,
  )
  return { fetchMock, onShow, onChanged, onClose, onFilterChange, document }
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
      draft: { pageId: 'page-1', cellId: 'api', point: null },
      responses: { [`POST ${threadsUrl}`]: { status: 201, body: created } },
    })
    const draft = await screen.findByRole('group', { name: 'Новая ветка' })
    expect(draft).toHaveTextContent('Новая ветка: «API»')
    const field = within(draft).getByRole('combobox', { name: 'Новый комментарий' })
    await waitFor(() => expect(field).toHaveFocus())

    await userEvent.type(field, 'Новая{Enter}')

    await waitFor(() => expect(screen.queryByRole('group', { name: 'Новая ветка' })).toBeNull())
    expect(bodyOf(fetchMock, 'POST', threadsUrl)).toEqual({
      pageId: 'page-1',
      cellId: 'api',
      point: null,
      body: 'Новая',
      mentions: [],
    })
    expect(onChanged).toHaveBeenCalled()
    expect(await screen.findByRole('article', { name: 'Ветка: «API»' })).toHaveTextContent('Новая')
  })

  it('starts a thread at a point, keeping what was typed when the point moves', async () => {
    const created = thread('new', { cellId: null, point: { x: 40, y: 50 }, comments: [comment('n', alice, 'Сюда кэш')] })
    const { fetchMock } = renderPanel({
      threads: [{ body: [] }, { body: [created] }],
      draft: { pageId: 'page-1', cellId: null, point: { x: 10, y: 20 } },
      nextDraft: { pageId: 'page-1', cellId: null, point: { x: 40, y: 50 } },
      responses: { [`POST ${threadsUrl}`]: { status: 201, body: created } },
    })
    const draft = await screen.findByRole('group', { name: 'Новая ветка' })
    expect(draft).toHaveTextContent('Новая ветка: Место на холсте')
    await userEvent.type(within(draft).getByRole('combobox', { name: 'Новый комментарий' }), 'Сюда кэш')

    await userEvent.click(screen.getByRole('button', { name: 'Другой черновик' }))
    await userEvent.type(screen.getByRole('combobox', { name: 'Новый комментарий' }), '{Enter}')

    await waitFor(() => expect(requestsOf(fetchMock, 'POST', threadsUrl)).toHaveLength(1))
    expect(bodyOf(fetchMock, 'POST', threadsUrl)).toEqual({
      pageId: 'page-1',
      cellId: null,
      point: { x: 40, y: 50 },
      body: 'Сюда кэш',
      mentions: [],
    })
    expect(await screen.findByRole('article', { name: 'Ветка: Место на холсте' })).toHaveTextContent('Сюда кэш')
  })

  it('tells the page which threads it shows', async () => {
    const { onFilterChange } = renderPanel({ threads: [] })
    await waitFor(() => expect(onFilterChange).toHaveBeenLastCalledWith('open'))

    await userEvent.click(screen.getByRole('button', { name: 'Решённые' }))

    expect(onFilterChange).toHaveBeenLastCalledWith('resolved')
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
    expect(focused).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('article', { name: 'Ветка: «API»' })).not.toHaveClass('ring-2')
  })

  it('shows the thread it was opened for among the threads it belongs to', async () => {
    renderPanel({
      threads: [thread('t1'), thread('t2', { cellId: 'link', resolvedAt: '2026-10-05T11:00:00Z' })],
      focus: { threadId: 't2' },
    })

    const focused = await screen.findByRole('article', { name: 'Ветка: Связь без подписи' })
    expect(focused).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'Решённые' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('article', { name: 'Ветка: «API»' })).toBeNull()
  })

  it('puts and takes away the reactions of the user and tells the others', async () => {
    const reacted = (people: Person[]) =>
      thread('t1', { comments: [{ ...comment('c1', bob, 'Почему без кэша?'), reactions: [{ reaction: 'thumbs-up', people }] }] })
    const reactionUrl = `${threadsUrl}/t1/comments/c1/reactions/thumbs-up`
    const { fetchMock, onChanged } = renderPanel({
      threads: [{ body: [reacted([bob])] }, { body: [reacted([bob, alice])] }, { body: [reacted([bob])] }],
      responses: { [`PUT ${reactionUrl}`]: { body: reacted([bob, alice]) }, [`DELETE ${reactionUrl}`]: { body: reacted([bob]) } },
    })
    const card = await screen.findByRole('article', { name: 'Ветка: «API»' })

    await userEvent.click(within(card).getByRole('button', { name: '👍 1' }))
    await waitFor(() => expect(requestsOf(fetchMock, 'PUT', reactionUrl)).toHaveLength(1))
    expect(onChanged).toHaveBeenCalledTimes(1)
    const mine = await within(card).findByRole('button', { name: '👍 2' })
    expect(mine).toHaveAttribute('aria-pressed', 'true')
    expect(mine).toHaveAttribute('title', 'Боб, Алиса')

    await userEvent.click(mine)
    await waitFor(() => expect(requestsOf(fetchMock, 'DELETE', reactionUrl)).toHaveLength(1))
    expect(await within(card).findByRole('button', { name: '👍 1' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reacts with any reaction of the set', async () => {
    const reactionUrl = `${threadsUrl}/t1/comments/t1-1/reactions/eyes`
    const { fetchMock } = renderPanel({ threads: [thread('t1')], responses: { [`PUT ${reactionUrl}`]: { body: thread('t1') } } })
    const card = await screen.findByRole('article', { name: 'Ветка: «API»' })

    await userEvent.click(within(card).getByRole('button', { name: 'Добавить реакцию' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Набор реакций' })).getByRole('button', { name: '👀' }))

    await waitFor(() => expect(requestsOf(fetchMock, 'PUT', reactionUrl)).toHaveLength(1))
  })

  it('assigns a thread to a participant, shows the assignee and takes them away', async () => {
    const assigned = thread('t1', { assignee: bob })
    const { fetchMock, onChanged } = renderPanel({
      threads: [{ body: [thread('t1')] }, { body: [assigned] }, { body: [thread('t1')] }],
      responses: {
        [`PUT ${threadsUrl}/t1/assignee`]: { body: assigned },
        [`DELETE ${threadsUrl}/t1/assignee`]: { body: thread('t1') },
      },
    })
    const card = await screen.findByRole('article', { name: 'Ветка: «API»' })

    await userEvent.click(within(card).getByRole('button', { name: 'Назначить' }))
    const picker = within(screen.getByRole('dialog', { name: 'Назначить ответственного' }))
    await userEvent.click(await picker.findByRole('button', { name: 'Боб' }))

    expect(bodyOf(fetchMock, 'PUT', `${threadsUrl}/t1/assignee`)).toEqual({ userId: 'bob' })
    expect(await within(card).findByRole('button', { name: 'Боб' })).toHaveAccessibleDescription('Назначить другого')
    expect(card).toHaveTextContent('Ответственный:')
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(within(card).queryByRole('button', { name: 'Назначить' })).toBeNull()

    await userEvent.click(within(card).getByRole('button', { name: 'Снять' }))
    await waitFor(() => expect(requestsOf(fetchMock, 'DELETE', `${threadsUrl}/t1/assignee`)).toHaveLength(1))
    expect(await within(card).findByRole('button', { name: 'Назначить' })).toBeInTheDocument()
    expect(card).not.toHaveTextContent('Ответственный')
  })

  it('says when a thread could not be assigned', async () => {
    renderPanel({ threads: [thread('t1')], responses: { [`PUT ${threadsUrl}/t1/assignee`]: { status: 404 } } })
    const card = await screen.findByRole('article', { name: 'Ветка: «API»' })

    await userEvent.click(within(card).getByRole('button', { name: 'Назначить' }))
    await userEvent.click(await within(screen.getByRole('dialog')).findByRole('button', { name: 'Боб' }))

    expect(await within(card).findByRole('alert')).toHaveTextContent('Не удалось назначить ответственного')
  })

  it('shows the threads assigned to the user, open and resolved', async () => {
    renderPanel({
      threads: [
        thread('mine', { assignee: alice }),
        thread('done', { assignee: alice, cellId: 'link', resolvedAt: '2026-10-05T11:00:00Z', resolvedBy: bob }),
        thread('theirs', { assignee: bob, cellId: null }),
      ],
    })
    await screen.findAllByRole('article')

    await userEvent.click(screen.getByRole('button', { name: 'Назначены мне' }))

    expect(screen.getAllByRole('article').map((article) => article.getAttribute('data-thread'))).toEqual(['mine', 'done'])
    expect(screen.getByRole('button', { name: 'Назначены мне' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('says when no thread is assigned to the user', async () => {
    renderPanel({ threads: [thread('t1', { assignee: bob })] })
    await screen.findByRole('article')

    await userEvent.click(screen.getByRole('button', { name: 'Назначены мне' }))

    expect(screen.getByText('Вам пока не назначено ни одной ветки.')).toBeInTheDocument()
  })

  it('says when the threads could not be loaded', async () => {
    renderPanel({ threads: [{ status: 500 }] })

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить комментарии')
  })
})
