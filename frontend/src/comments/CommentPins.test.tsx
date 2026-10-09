import { QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommentThread, Person } from '../api/comments.ts'
import { createQueryClient } from '../queryClient.ts'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { mockFetch, type MockResponse } from '../test/render.tsx'
import { CommentPins } from './CommentPins.tsx'
import type { ThreadDraft } from './CommentsPanel.tsx'
import { useThreads } from './useComments.ts'

const boardId = '0199a000-0000-7000-8000-000000000001'
const threadsUrl = `/api/boards/${boardId}/threads`
const alice: Person = { id: 'alice', name: 'Алиса', avatarUrl: null }
const bob: Person = { id: 'bob', name: 'Боб', avatarUrl: null }

const thread = (id: string, changes: Partial<CommentThread> = {}): CommentThread => ({
  id,
  pageId: 'page-1',
  cellId: null,
  point: { x: 100, y: 80 },
  decisionId: null,
  createdAt: '2026-10-05T10:00:00Z',
  resolvedAt: null,
  resolvedBy: null,
  assignee: null,
  comments: [
    {
      id: `${id}-1`,
      author: bob,
      body: 'Сюда нужен кэш\nи очередь',
      mentions: [],
      reactions: [],
      createdAt: '2026-10-05T10:00:00Z',
      editedAt: null,
    },
  ],
  ...changes,
})

interface Setup {
  /** The threads, or the responses to the requests of the threads in order. */
  threads: CommentThread[] | MockResponse[]
  responses?: Record<string, MockResponse | MockResponse[]>
  editor?: FakeEditor
  draft?: ThreadDraft | null
  showResolved?: boolean
  focusedThreadId?: string | null
  userId?: string
  isOwner?: boolean
}

function renderPins({
  threads,
  responses = {},
  editor = createFakeEditor({ pageId: 'page-1' }),
  draft = null,
  showResolved = false,
  focusedThreadId = null,
  userId = 'bob',
  isOwner = false,
}: Setup) {
  const fetchMock = mockFetch({
    [`GET ${threadsUrl}`]: threads.some((entry) => !('id' in entry)) ? (threads as MockResponse[]) : { body: threads },
    ...responses,
  })
  const onOpen = vi.fn()
  const onChanged = vi.fn()
  function Pins() {
    const threads = useThreads(boardId)
    return (
      <CommentPins
        editor={editor}
        boardId={boardId}
        threads={threads.data}
        draft={draft}
        showResolved={showResolved}
        focusedThreadId={focusedThreadId}
        userId={userId}
        isOwner={isOwner}
        onOpen={onOpen}
        onChanged={onChanged}
      />
    )
  }
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Pins />
    </QueryClientProvider>,
  )
  return { editor, fetchMock, onOpen, onChanged }
}

const position = (element: HTMLElement) => [element.style.left, element.style.top]

/** Presses the main button on the mark, moves the pointer by (dx, dy) in steps and releases it. */
function dragMark(mark: HTMLElement, dx: number, dy: number) {
  const from = { clientX: 110, clientY: 70, pointerId: 1, button: 0 }
  fireEvent.pointerDown(mark, from)
  fireEvent.pointerMove(mark, { ...from, clientX: from.clientX + dx / 2, clientY: from.clientY + dy / 2 })
  fireEvent.pointerMove(mark, { ...from, clientX: from.clientX + dx, clientY: from.clientY + dy })
  fireEvent.pointerUp(mark, { ...from, clientX: from.clientX + dx, clientY: from.clientY + dy })
  fireEvent.click(mark)
}

describe('CommentPins', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('marks the open threads of the page at their points with the number of their comments, and follows the view', async () => {
    const { editor } = renderPins({
      threads: [
        thread('a'),
        thread('answered', { point: { x: 300, y: 40 }, comments: [...thread('x').comments, ...thread('y').comments] }),
        thread('resolved', { resolvedAt: '2026-10-05T11:00:00Z' }),
        thread('element', { cellId: 'api', point: null }),
        thread('page', { point: null }),
        thread('other', { pageId: 'page-2' }),
      ],
    })

    const marks = await screen.findAllByTestId('comment-pin')
    expect(marks.map((mark) => mark.dataset.thread)).toEqual(['a', 'answered'])
    expect(marks[0]).toHaveAccessibleName('Комментарии в точке: 1')
    expect(marks[0]).toHaveTextContent('1')
    expect(marks[0]).toHaveAttribute('title', 'Боб: Сюда нужен кэш')
    expect(marks[1]).toHaveAccessibleName('Комментарии в точке: 2')
    // The pointed bottom-left corner stands at the point.
    expect(position(marks[0]!)).toEqual(['100px', '58px'])

    act(() => editor.scrollTo({ x: 20, y: 10 }))

    expect(position(screen.getAllByTestId('comment-pin')[0]!)).toEqual(['80px', '48px'])
  })

  it('marks the resolved threads too while the panel shows them, and highlights the thread it was opened on', async () => {
    renderPins({
      threads: [thread('a'), thread('resolved', { resolvedAt: '2026-10-05T11:00:00Z' })],
      showResolved: true,
      focusedThreadId: 'resolved',
    })

    const resolved = await screen.findByRole('button', { name: 'Комментарии в точке (решено): 1' })
    expect(resolved).toHaveClass('bg-slate-300')
    expect(resolved).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'Комментарии в точке: 1' })).not.toHaveAttribute('aria-current')
  })

  it('opens the thread of a mark', async () => {
    const { onOpen } = renderPins({ threads: [thread('a')], userId: 'carol' })

    await userEvent.click(await screen.findByRole('button', { name: 'Комментарии в точке: 1' }))

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
  })

  it('marks the point of a new thread on its page only', async () => {
    const draft: ThreadDraft = { pageId: 'page-1', cellId: null, point: { x: 40, y: 50 } }
    renderPins({ threads: [], draft })

    const mark = await screen.findByRole('img', { name: 'Новая ветка здесь' })
    expect(position(mark)).toEqual(['40px', '28px'])

    document.body.innerHTML = ''
    renderPins({ threads: [], draft: { ...draft, pageId: 'page-2' } })
    renderPins({ threads: [], draft: { pageId: 'page-1', cellId: 'api', point: null } })
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Новая ветка здесь' })).toBeNull())
  })

  it('lets the author drag the mark to another point, which is kept and told to the others', async () => {
    const moved = thread('a', { point: { x: 130, y: 60 } })
    const { fetchMock, onOpen, onChanged } = renderPins({
      threads: [{ body: [thread('a')] }, { body: [moved] }],
      responses: { [`PATCH ${threadsUrl}/a`]: { body: moved } },
    })
    const mark = await screen.findByRole('button', { name: 'Комментарии в точке: 1' })

    dragMark(mark, 30, -20)

    expect(position(mark)).toEqual(['130px', '38px'])
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    const [, init] = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(JSON.parse(String(init!.body))).toEqual({ point: { x: 130, y: 60 } })
    expect(onOpen).not.toHaveBeenCalled()
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === 'GET')).toHaveLength(2))
    expect(position(screen.getByTestId('comment-pin'))).toEqual(['130px', '38px'])

    // A press that hardly moves is a click.
    fireEvent.pointerDown(mark, { clientX: 10, clientY: 10, pointerId: 2, button: 0 })
    fireEvent.pointerMove(mark, { clientX: 12, clientY: 11, pointerId: 2 })
    fireEvent.pointerUp(mark, { clientX: 12, clientY: 11, pointerId: 2 })
    fireEvent.click(mark)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('puts the mark back when the move fails', async () => {
    renderPins({ threads: [thread('a')], responses: { [`PATCH ${threadsUrl}/a`]: { status: 403 } } })
    const mark = await screen.findByRole('button', { name: 'Комментарии в точке: 1' })

    dragMark(mark, 30, -20)

    await waitFor(() => expect(position(mark)).toEqual(['100px', '58px']))
  })

  it('lets nobody but the author and the owner drag the mark of a thread', async () => {
    const { fetchMock, onOpen } = renderPins({ threads: [thread('a')], userId: 'alice' })
    const mark = await screen.findByRole('button', { name: 'Комментарии в точке: 1' })

    dragMark(mark, 30, -20)

    expect(position(mark)).toEqual(['100px', '58px'])
    expect(onOpen).toHaveBeenCalled()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)

    document.body.innerHTML = ''
    renderPins({
      threads: [thread('a', { comments: [{ ...thread('a').comments[0]!, author: alice }] })],
      userId: 'bob',
      isOwner: true,
      responses: { [`PATCH ${threadsUrl}/a`]: { body: thread('a') } },
    })
    const owned = await screen.findByRole('button', { name: 'Комментарии в точке: 1' })
    expect(owned).toHaveClass('cursor-move')
    dragMark(owned, 30, -20)
    expect(position(owned)).toEqual(['130px', '38px'])
  })
})
