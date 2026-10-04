import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Layout } from './Layout.tsx'
import { BoardsPage } from './pages/BoardsPage.tsx'
import { ALICE, mockFetch, renderRoutes } from './test/render.tsx'

const routes = [
  { path: '/login', element: <p>Страница входа</p> },
  { path: '/', element: <Layout />, children: [{ index: true, element: <BoardsPage /> }] },
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

  it('shows the name and the avatar of the signed-in user in the header', async () => {
    mockFetch({ 'GET /api/me': { body: ALICE }, 'GET /api/boards': { body: [] } })

    renderRoutes(routes)

    const header = await screen.findByRole('banner')
    expect(await within(header).findByText('Алиса')).toBeInTheDocument()
    expect(within(header).getByRole('presentation')).toHaveAttribute('src', ALICE.avatarUrl)
    expect(await screen.findByText('Досок пока нет')).toBeInTheDocument()
  })

  it('offers a guest to sign in instead of signing out', async () => {
    mockFetch({ 'GET /api/me': { body: { id: 'guest-1', name: 'Гость 42', avatarUrl: null, guest: true } }, 'GET /api/boards': { body: [] } })
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
    })
    const { router } = renderRoutes(routes)

    await userEvent.click(await screen.findByRole('button', { name: 'Выйти' }))

    expect(await screen.findByText('Страница входа')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    const [, init] = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(init!.headers).toMatchObject({ 'X-XSRF-TOKEN': 'csrf-1' })
  })

  it('opens the login page when the session ends while the user works', async () => {
    mockFetch({ 'GET /api/me': [{ body: ALICE }, { status: 401 }], 'GET /api/boards': { status: 401 } })

    const { router } = renderRoutes(routes)

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })
})
