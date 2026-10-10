import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createQueryClient } from '../queryClient.ts'
import { LOGIN_OPTIONS, mockFetch, renderRoutes } from '../test/render.tsx'
import { LoginPage } from './LoginPage.tsx'

const PROVIDERS = { 'GET /api/auth/providers': { body: LOGIN_OPTIONS } }

const routes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <p>Доски</p> },
]

describe('LoginPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers to sign in with GitHub or Google', async () => {
    mockFetch(PROVIDERS)
    renderRoutes(routes, '/login')

    expect(await screen.findByRole('link', { name: 'Войти через GitHub' })).toHaveAttribute(
      'href',
      '/api/oauth2/authorization/github',
    )
    expect(screen.getByRole('link', { name: 'Войти через Google' })).toHaveAttribute('href', '/api/oauth2/authorization/google')
    expect(screen.getByRole('button', { name: 'Продолжить без входа' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('offers only the corporate sign-in of a closed installation', async () => {
    mockFetch({ 'GET /api/auth/providers': { body: { providers: [{ id: 'corp', name: 'Keycloak компании' }], guests: false } } })
    renderRoutes(routes, '/login')

    expect(await screen.findByRole('link', { name: 'Войти через Keycloak компании' })).toHaveAttribute(
      'href',
      '/api/oauth2/authorization/corp',
    )
    expect(screen.queryByRole('link', { name: 'Войти через GitHub' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Войти через Google' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Продолжить без входа' })).toBeNull()
  })

  it('says that an installation without any way to sign in is not set up', async () => {
    mockFetch({ 'GET /api/auth/providers': { body: { providers: [], guests: false } } })
    renderRoutes(routes, '/login')

    expect(await screen.findByText('Вход не настроен. Обратитесь к администратору.')).toBeInTheDocument()
  })

  it('says that the restrictions of the provider turned the user away', () => {
    mockFetch(PROVIDERS)
    renderRoutes(routes, '/login?error=denied')

    expect(screen.getByRole('alert')).toHaveTextContent('Вход в эту установку CoDraw вам не разрешён. Обратитесь к администратору.')
  })

  it('says that signing in accepts the terms of use and the privacy policy, with links to them', () => {
    mockFetch(PROVIDERS)
    renderRoutes(routes, '/login')

    expect(screen.getByText(/Входя или продолжая без входа, вы принимаете/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'условия использования' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'политику конфиденциальности' })).toHaveAttribute('href', '/privacy')
  })

  it('continues without a sign-in as a guest and opens the boards', async () => {
    const fetchMock = mockFetch({ ...PROVIDERS, 'POST /api/guest': { status: 204 } })
    const { router } = renderRoutes(routes, '/login')

    await userEvent.click(await screen.findByRole('button', { name: 'Продолжить без входа' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    const [, init] = fetchMock.mock.calls.find(([input]) => input.toString() === '/api/guest')!
    expect(init!.headers).toMatchObject({ 'X-XSRF-TOKEN': 'test-csrf' })
  })

  it('comes back to the page that sent the visitor to sign in, e.g. an invitation', async () => {
    mockFetch({ ...PROVIDERS, 'POST /api/guest': { status: 204 } })
    const router = createMemoryRouter([...routes, { path: '/invite/:token', element: <p>Приглашение</p> }], {
      initialEntries: [{ pathname: '/login', state: { from: '/invite/AAAAAAAAAAAAAAAAAAAAAA' } }],
    })
    render(
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Продолжить без входа' }))

    expect(await screen.findByText('Приглашение')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/invite/AAAAAAAAAAAAAAAAAAAAAA')
  })

  it('says when continuing without a sign-in failed', async () => {
    mockFetch({ ...PROVIDERS, 'POST /api/guest': { status: 500 } })
    renderRoutes(routes, '/login')

    await userEvent.click(await screen.findByRole('button', { name: 'Продолжить без входа' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось продолжить без входа')
  })

  it('says that the address created too many guests lately', async () => {
    mockFetch({ ...PROVIDERS, 'POST /api/guest': { status: 429, body: { title: 'Too Many Requests' } } })
    renderRoutes(routes, '/login')

    await userEvent.click(await screen.findByRole('button', { name: 'Продолжить без входа' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Слишком много новых гостей с вашего адреса. Попробуйте позже или войдите.',
    )
  })

  it('says that the sign-in failed when the provider sends the user back with an error', () => {
    mockFetch(PROVIDERS)
    renderRoutes(routes, '/login?error')

    expect(screen.getByRole('alert')).toHaveTextContent('Вход не выполнен')
  })
})
