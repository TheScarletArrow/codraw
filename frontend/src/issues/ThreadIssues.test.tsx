import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommentThread } from '../api/comments.ts'
import type { TrackerSettings } from '../api/issues.ts'
import { createQueryClient } from '../queryClient.ts'
import { issueLink } from '../test/issueLinks.ts'
import { mockFetch, type MockResponse } from '../test/render.tsx'
import { ThreadIssues } from './ThreadIssues.tsx'
import { BoardIssuesContext, type BoardIssues } from './useIssues.ts'

const boardId = '0199a000-0000-7000-8000-000000000001'
const connected: TrackerSettings = {
  available: true,
  tracker: 'github',
  webUrl: 'https://github.com',
  connection: { login: 'bob-gh', connectedAt: '2026-10-01T10:00:00Z', working: true, rejectedAt: null },
}
const thread: CommentThread = {
  id: 'thread-1',
  pageId: 'page-1',
  cellId: 'api',
  decisionId: null,
  point: null,
  createdAt: '2026-10-09T10:00:00Z',
  resolvedAt: null,
  resolvedBy: null,
  assignee: null,
  comments: [
    {
      id: 'comment-1',
      author: { id: 'alice', name: 'Алиса', avatarUrl: null },
      body: 'Нужен кэш перед каталогом\nИначе медленно',
      mentions: [],
      reactions: [],
      createdAt: '2026-10-09T10:00:00Z',
      editedAt: null,
    },
  ],
}
const fresh = () => new Date().toISOString()

function renderIssues(issues: Partial<BoardIssues> | null, responses: Record<string, MockResponse | MockResponse[]> = {}) {
  const fetchMock = mockFetch({ 'GET /api/issue-tracker': { body: connected }, ...responses })
  const value: BoardIssues | null = issues && {
    boardId,
    links: [],
    userId: 'bob',
    guest: false,
    canEdit: false,
    onChanged: vi.fn(),
    ...issues,
  }
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <BoardIssuesContext value={value}>
          <ThreadIssues thread={thread} />
        </BoardIssuesContext>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return fetchMock
}

describe('ThreadIssues', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the issues of the thread, which the user who linked one unlinks without editing the board', async () => {
    renderIssues({
      links: [
        issueLink({ id: 'mine', pageId: null, cellId: null, threadId: 'thread-1', linkedBy: { id: 'bob', name: 'Боб', avatarUrl: null }, syncedAt: fresh() }),
        issueLink({ id: 'theirs', number: 13, title: 'Чужая', pageId: null, cellId: null, threadId: 'thread-1', syncedAt: fresh() }),
        issueLink({ id: 'element', title: 'Элемента', syncedAt: fresh() }),
      ],
    })

    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByRole('button', { name: 'Отвязать acme/shop#12' })).toBeInTheDocument()
    expect(within(items[1]!).queryByRole('button', { name: /Отвязать/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Элемента')).not.toBeInTheDocument()
  })

  it('creates an issue from the thread, titled by its first line', async () => {
    localStorage.setItem('codraw.issues.repository', 'acme/shop')
    const fetchMock = renderIssues(
      {},
      {
        'GET /api/issue-tracker/repositories': { body: [] },
        [`POST /api/boards/${boardId}/issues`]: { status: 201, body: issueLink({ threadId: 'thread-1', pageId: null, cellId: null }) },
      },
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Задача' }))
    const window = await screen.findByRole('dialog', { name: 'Задача GitHub' })
    await userEvent.click(within(window).getByRole('tab', { name: 'Новая' }))
    expect(within(window).getByLabelText('Название')).toHaveValue('Нужен кэш перед каталогом')
    expect(window).toHaveTextContent('В конце задачи будет ссылка на это обсуждение в CoDraw.')
    await userEvent.click(within(window).getByRole('button', { name: 'Создать в GitHub' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const created = fetchMock.mock.calls.find(([input]) => input.toString() === `/api/boards/${boardId}/issues`)!
    expect(JSON.parse(created[1]!.body as string)).toMatchObject({ threadId: 'thread-1', title: 'Нужен кэш перед каталогом' })
    localStorage.clear()
  })

  it('shows nothing outside of a board, nor to a guest of a thread without issues', async () => {
    const { container } = render(
      <QueryClientProvider client={createQueryClient()}>
        <ThreadIssues thread={thread} />
      </QueryClientProvider>,
    )
    expect(container).toBeEmptyDOMElement()

    renderIssues({ guest: true })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(screen.queryByRole('button', { name: 'Задача' })).not.toBeInTheDocument()
  })
})
