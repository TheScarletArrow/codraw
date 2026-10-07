import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NotificationPage, UserNotification } from '../api/notifications.ts'
import { mockFetch, renderRoutes, type MockResponse } from '../test/render.tsx'
import { NotificationBell } from './NotificationBell.tsx'
import { NOTIFICATIONS_POLL_INTERVAL } from './notifications.ts'

const boardId = '0199a000-0000-7000-8000-000000000001'
const countUrl = '/api/notifications/unread-count'
const listUrl = '/api/notifications'

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

function notification(id: string, changes: Partial<UserNotification> = {}): UserNotification {
  return {
    id,
    kind: 'mention',
    boardId,
    access: true,
    boardTitle: 'Схема БД',
    pageId: 'page-2',
    cellId: null,
    threadId: 'thread-1',
    commentId: `comment-${id}`,
    proposalId: null,
    snippet: '@Боб посмотри',
    actor: { id: 'anya', name: 'Аня', avatarUrl: 'https://avatars.example.com/anya.png' },
    role: null,
    createdAt: minutesAgo(5),
    readAt: null,
    ...changes,
  }
}

const page = (notifications: UserNotification[], next: string | null = null): MockResponse => ({
  body: { notifications, next } satisfies NotificationPage,
})

const routes = [
  { path: '/', element: <NotificationBell /> },
  { path: '/boards/:boardId', element: <p>Доска</p> },
]

function renderBell(responses: Record<string, MockResponse | MockResponse[]>) {
  const fetchMock = mockFetch(responses)
  const { router } = renderRoutes(routes)
  return { fetchMock, router }
}

const requests = (fetchMock: ReturnType<typeof mockFetch>, method: string, url: string) =>
  fetchMock.mock.calls.filter(([input, init]) => (init?.method ?? 'GET') === method && input.toString() === url)

const list = () => within(screen.getByRole('dialog', { name: 'Уведомления' }))

describe('NotificationBell', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('shows how many notifications are unread and asks for the number again from time to time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { fetchMock } = renderBell({ [`GET ${countUrl}`]: [{ body: { count: 2 } }, { body: { count: 0 } }] })

    expect(await screen.findByRole('button', { name: 'Уведомления (2)' })).toHaveTextContent('2')

    await act(() => vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL))

    expect(await screen.findByRole('button', { name: 'Уведомления' })).not.toHaveTextContent('2')
    expect(requests(fetchMock, 'GET', countUrl)).toHaveLength(2)
  })

  it('asks for the number again when the user comes back to the tab', async () => {
    const { fetchMock } = renderBell({ [`GET ${countUrl}`]: [{ body: { count: 0 } }, { body: { count: 1 } }] })
    await screen.findByRole('button', { name: 'Уведомления' })

    act(() => window.dispatchEvent(new Event('visibilitychange')))

    expect(await screen.findByRole('button', { name: 'Уведомления (1)' })).toBeInTheDocument()
    expect(requests(fetchMock, 'GET', countUrl)).toHaveLength(2)
  })

  it('lists who did what on which board, with the comment, the time and the mark of unread ones', async () => {
    renderBell({
      [`GET ${countUrl}`]: { body: { count: 1 } },
      [`GET ${listUrl}`]: page([
        notification('n-2'),
        notification('n-1', {
          kind: 'access-request',
          role: 'editor',
          actor: { id: 'egor', name: 'Егор', avatarUrl: null },
          pageId: null,
          threadId: null,
          commentId: null,
          snippet: null,
          createdAt: minutesAgo(3 * 60),
          readAt: minutesAgo(60),
        }),
      ]),
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Уведомления (1)' }))

    const items = await list().findAllByRole('link')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveAccessibleName('Аня: упоминание в «Схема БД» @Боб посмотри 5 минут назад Не прочитано')
    expect(within(items[0]!).getByRole('presentation')).toHaveAttribute('src', 'https://avatars.example.com/anya.png')
    expect(items[1]).toHaveAccessibleName('Егор: запрос доступа к «Схема БД» Просит редактирование 3 часа назад')
    expect(within(items[1]!).queryByText('Не прочитано')).toBeNull()
  })

  it('says when there are no notifications', async () => {
    renderBell({ [`GET ${countUrl}`]: { body: { count: 0 } }, [`GET ${listUrl}`]: page([]) })

    await userEvent.click(await screen.findByRole('button', { name: 'Уведомления' }))

    expect(await list().findByText('Уведомлений пока нет')).toBeInTheDocument()
    expect(list().getByRole('button', { name: 'Прочитать все' })).toBeDisabled()
  })

  it('shows older notifications on «Показать ещё»', async () => {
    const { fetchMock } = renderBell({
      [`GET ${countUrl}`]: { body: { count: 0 } },
      [`GET ${listUrl}`]: page([notification('n-2', { readAt: minutesAgo(1) })], 'n-2'),
      [`GET ${listUrl}?before=n-2`]: page([notification('n-1', { snippet: 'Старое', readAt: minutesAgo(1) })]),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Уведомления' }))

    await userEvent.click(await list().findByRole('button', { name: 'Показать ещё' }))

    await waitFor(() => expect(list().getAllByRole('link')).toHaveLength(2))
    expect(list().getAllByRole('link')[1]).toHaveTextContent('Старое')
    expect(list().queryByRole('button', { name: 'Показать ещё' })).toBeNull()
    expect(requests(fetchMock, 'GET', `${listUrl}?before=n-2`)).toHaveLength(1)
  })

  it('marks a notification read and opens the thread it is about', async () => {
    const { fetchMock, router } = renderBell({
      [`GET ${countUrl}`]: { body: { count: 1 } },
      [`GET ${listUrl}`]: page([notification('n-1')]),
      [`POST ${listUrl}/n-1/read`]: { status: 204 },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Уведомления (1)' }))

    await userEvent.click(await list().findByRole('link', { name: /^Аня: упоминание в «Схема БД»/ }))

    expect(await screen.findByText('Доска')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/boards/${boardId}`)
    expect(router.state.location.search).toBe('?page=page-2&thread=thread-1')
    await waitFor(() => expect(requests(fetchMock, 'POST', `${listUrl}/n-1/read`)).toHaveLength(1))
  })

  it('tells of a thread assigned to the user and opens it', async () => {
    const { router } = renderBell({
      [`GET ${countUrl}`]: { body: { count: 1 } },
      [`GET ${listUrl}`]: page([notification('n-1', { kind: 'assigned', commentId: null, snippet: 'Поправь связь' })]),
      [`POST ${listUrl}/n-1/read`]: { status: 204 },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Уведомления (1)' }))

    const item = await list().findByRole('link')
    expect(item).toHaveAccessibleName('Аня: вам назначена ветка в «Схема БД» Поправь связь 5 минут назад Не прочитано')
    await userEvent.click(item)

    expect(await screen.findByText('Доска')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?page=page-2&thread=thread-1')
  })

  it('reads all notifications', async () => {
    const { fetchMock } = renderBell({
      [`GET ${countUrl}`]: [{ body: { count: 2 } }, { body: { count: 2 } }, { body: { count: 0 } }],
      [`GET ${listUrl}`]: [
        page([notification('n-2'), notification('n-1')]),
        page([notification('n-2', { readAt: minutesAgo(0) }), notification('n-1', { readAt: minutesAgo(0) })]),
      ],
      [`POST ${listUrl}/read-all`]: { status: 204 },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Уведомления (2)' }))
    await waitFor(() => expect(list().getAllByText('Не прочитано')).toHaveLength(2))

    await userEvent.click(list().getByRole('button', { name: 'Прочитать все' }))

    await waitFor(() => expect(list().queryAllByText('Не прочитано')).toHaveLength(0))
    expect(screen.getByRole('button', { name: 'Уведомления' })).toBeInTheDocument()
    expect(requests(fetchMock, 'POST', `${listUrl}/read-all`)).toHaveLength(1)
  })
})
