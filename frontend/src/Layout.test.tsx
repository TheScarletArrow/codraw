import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { InHeader } from './headerSlot.tsx'
import { Layout } from './Layout.tsx'
import { findLocalCopy, openLocalCopy } from './offline/localCopies.ts'
import { BoardsPage } from './pages/BoardsPage.tsx'
import { ALICE, mockFetch, renderRoutes } from './test/render.tsx'

const unreadCount = { 'GET /api/notifications/unread-count': { body: { count: 0 } } }

/** Keeps a copy of a board for the user in the browser, as the page of the board does. */
async function storeCopy(userId: string, boardId: string) {
  const persistence = openLocalCopy(userId, boardId, 'Доска', new Y.Doc())!
  await persistence.whenSynced
  await persistence.destroy()
}

const boardId = '0199a000-0000-7000-8000-000000000001'

const routes = [
  { path: '/login', element: <p>Страница входа</p> },
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <BoardsPage /> },
      { path: 'invite/:token', element: <p>Приглашение</p> },
      {
        path: 'boards/:boardId',
        element: (
          <>
            <p>Холст</p>
            <InHeader>
              <p>Кто на доске</p>
            </InHeader>
          </>
        ),
      },
    ],
  },
]

describe('Layout', () => {
  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; path=/; max-age=0'
    vi.unstubAllGlobals()
  })

  it('opens the login page when there is no session', async () => {
    mockFetch({ 'GET /api/me': { status: 401 } })

    const { router } = renderRoutes(routes)

    expect(await screen.findByText('Страница входа')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('remembers the page that needs a session for the login page to come back to', async () => {
    mockFetch({ 'GET /api/me': { status: 401 } })

    const { router } = renderRoutes(routes, '/invite/AAAAAAAAAAAAAAAAAAAAAA?x=1')

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.state).toEqual({ from: '/invite/AAAAAAAAAAAAAAAAAAAAAA?x=1' })
  })

  it('shows the name and the avatar of the signed-in user in the header', async () => {
    mockFetch({ 'GET /api/me': { body: ALICE }, 'GET /api/boards': { body: [] }, ...unreadCount })

    renderRoutes(routes)

    const header = await screen.findByRole('banner')
    expect(await within(header).findByText('Алиса')).toBeInTheDocument()
    expect(within(header).getByRole('presentation')).toHaveAttribute('src', ALICE.avatarUrl)
    expect(await screen.findByText('Досок пока нет')).toBeInTheDocument()
  })

  it('shows in the header what the page puts there, out of the page', async () => {
    mockFetch({ 'GET /api/me': { body: ALICE }, ...unreadCount })

    renderRoutes(routes, `/boards/${boardId}`)

    const header = await screen.findByRole('banner')
    expect(await within(header).findByText('Кто на доске')).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByText('Холст')).toBeInTheDocument()
    expect(within(screen.getByRole('main')).queryByText('Кто на доске')).toBeNull()
  })

  it('offers the theme in the menu of the user, of a guest too', async () => {
    mockFetch({
      'GET /api/me': { body: { id: 'guest-1', name: 'Гость 42', avatarUrl: null, guest: true } },
      'GET /api/boards': { body: [] },
      ...unreadCount,
    })

    renderRoutes(routes)

    const header = await screen.findByRole('banner')
    await userEvent.click(await within(header).findByRole('button', { name: 'Тема: Как в системе' }))
    expect(screen.getByRole('radio', { name: 'Тёмная' })).toBeInTheDocument()
  })

  it('shows the notifications of the signed-in user in the header, of a guest too', async () => {
    mockFetch({
      'GET /api/me': { body: { id: 'guest-1', name: 'Гость 42', avatarUrl: null, guest: true } },
      'GET /api/boards': { body: [] },
      'GET /api/notifications/unread-count': { body: { count: 3 } },
    })

    renderRoutes(routes)

    const header = await screen.findByRole('banner')
    expect(await within(header).findByRole('button', { name: 'Уведомления (3)' })).toBeInTheDocument()
  })

  it('offers a guest to sign in instead of signing out', async () => {
    mockFetch({
      'GET /api/me': { body: { id: 'guest-1', name: 'Гость 42', avatarUrl: null, guest: true } },
      'GET /api/boards': { body: [] },
      ...unreadCount,
    })
    const { router } = renderRoutes(routes)

    const header = await screen.findByRole('banner')
    expect(await within(header).findByText('Гость 42')).toBeInTheDocument()
    expect(within(header).queryByRole('button', { name: 'Выйти' })).toBeNull()

    await userEvent.click(within(header).getByRole('link', { name: 'Войти' }))

    expect(router.state.location.pathname).toBe('/login')
  })

  it('signs out with the CSRF token and opens the login page', async () => {
    document.cookie = 'XSRF-TOKEN=csrf-1; path=/'
    const fetchMock = mockFetch({
      'GET /api/me': { body: ALICE },
      'GET /api/boards': { body: [] },
      'POST /api/logout': { status: 204 },
      ...unreadCount,
    })
    const { router } = renderRoutes(routes)

    await userEvent.click(await screen.findByRole('button', { name: 'Выйти' }))

    expect(await screen.findByText('Страница входа')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    const [, init] = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(init!.headers).toMatchObject({ 'X-XSRF-TOKEN': 'csrf-1' })
  })

  it('removes the local copies of the boards of the user when they sign out', async () => {
    await storeCopy(ALICE.id, boardId)
    mockFetch({
      'GET /api/me': { body: ALICE },
      'GET /api/boards': { body: [] },
      'POST /api/logout': { status: 204 },
      ...unreadCount,
    })
    renderRoutes(routes)

    await userEvent.click(await screen.findByRole('button', { name: 'Выйти' }))

    expect(await screen.findByText('Страница входа')).toBeInTheDocument()
    await waitFor(async () => expect(await indexedDB.databases()).toEqual([]))
    expect(findLocalCopy(ALICE.id, boardId)).toBeNull()
  })

  it('removes the local copies that another user of the browser left', async () => {
    await storeCopy('guest-1', boardId)
    await storeCopy(ALICE.id, boardId)
    mockFetch({ 'GET /api/me': { body: ALICE }, 'GET /api/boards': { body: [] }, ...unreadCount })

    renderRoutes(routes)

    await waitFor(async () =>
      expect((await indexedDB.databases()).map((database) => database.name)).toEqual([`codraw:${ALICE.id}:${boardId}`]),
    )
    expect(findLocalCopy('guest-1', boardId)).toBeNull()
    expect(findLocalCopy(ALICE.id, boardId)).not.toBeNull()
  })

  it('opens the login page when the session ends while the user works', async () => {
    mockFetch({ 'GET /api/me': [{ body: ALICE }, { status: 401 }], 'GET /api/boards': { status: 401 }, ...unreadCount })

    const { router } = renderRoutes(routes)

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })
})
