import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockFetch, renderRoutes } from '../test/render.tsx'
import { LoginPage } from './LoginPage.tsx'

const routes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <p>Доски</p> },
]

describe('LoginPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers to sign in with GitHub or Google', () => {
    renderRoutes(routes, '/login')

    expect(screen.getByRole('link', { name: 'Войти через GitHub' })).toHaveAttribute('href', '/api/oauth2/authorization/github')
    expect(screen.getByRole('link', { name: 'Войти через Google' })).toHaveAttribute('href', '/api/oauth2/authorization/google')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says that signing in accepts the terms of use and the privacy policy, with links to them', () => {
    renderRoutes(routes, '/login')

    expect(screen.getByText(/Входя или продолжая без входа, вы принимаете/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'условия использования' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'политику конфиденциальности' })).toHaveAttribute('href', '/privacy')
  })

  it('continues without a sign-in as a guest and opens the boards', async () => {
    const fetchMock = mockFetch({ 'POST /api/guest': { status: 204 } })
    const { router } = renderRoutes(routes, '/login')

    await userEvent.click(screen.getByRole('button', { name: 'Продолжить без входа' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    const [, init] = fetchMock.mock.calls.find(([input]) => input.toString() === '/api/guest')!
    expect(init!.headers).toMatchObject({ 'X-XSRF-TOKEN': 'test-csrf' })
  })

  it('says when continuing without a sign-in failed', async () => {
    mockFetch({ 'POST /api/guest': { status: 500 } })
    renderRoutes(routes, '/login')

    await userEvent.click(screen.getByRole('button', { name: 'Продолжить без входа' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось продолжить без входа')
  })

  it('says that the address created too many guests lately', async () => {
    mockFetch({ 'POST /api/guest': { status: 429, body: { title: 'Too Many Requests' } } })
    renderRoutes(routes, '/login')

    await userEvent.click(screen.getByRole('button', { name: 'Продолжить без входа' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Слишком много новых гостей с вашего адреса. Попробуйте позже или войдите через GitHub или Google.',
    )
  })

  it('says that the sign-in failed when the provider sends the user back with an error', () => {
    renderRoutes(routes, '/login?error')

    expect(screen.getByRole('alert')).toHaveTextContent('Вход не выполнен')
  })
})
