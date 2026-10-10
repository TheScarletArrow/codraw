import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockFetch, renderRoutes } from '../test/render.tsx'
import { WorkspaceInvitePage } from './WorkspaceInvitePage.tsx'

const token = 'AAAAAAAAAAAAAAAAAAAAAA'
const acceptUrl = `POST /api/workspace-invites/${token}/accept`
const routes = [
  { path: '/', element: <p>Список досок</p> },
  { path: '/workspace-invite/:token', element: <WorkspaceInvitePage /> },
  { path: '/workspaces/:workspaceId', element: <p>Страница пространства</p> },
]

describe('WorkspaceInvitePage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('accepts the invitation once and opens the workspace in place of the invitation', async () => {
    const fetchMock = mockFetch({
      [acceptUrl]: {
        body: { id: 'w1', name: 'Платформа', role: 'editor', createdAt: '2026-10-01T10:00:00Z', members: 2, boards: 0 },
      },
      'GET /api/workspaces': { body: [] },
    })

    const { router } = renderRoutes(routes, `/workspace-invite/${token}`)

    expect(await screen.findByText('Страница пространства')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/workspaces/w1')
    expect(router.state.historyAction).toBe('REPLACE')
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  })

  it('offers a guest to sign in through a provider', async () => {
    mockFetch({
      [acceptUrl]: { status: 403, body: { title: 'Account required' } },
      'GET /api/auth/providers': { body: { providers: [{ id: 'corp', name: 'Keycloak компании' }], guests: false } },
    })

    renderRoutes(routes, `/workspace-invite/${token}`)

    expect(await screen.findByRole('heading', { name: 'Нужен вход' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Войти через Keycloak компании' })).toHaveAttribute(
      'href',
      '/api/oauth2/authorization/corp',
    )
    expect(screen.queryByRole('link', { name: 'Войти через GitHub' })).toBeNull()
  })

  it('says that a revoked invitation is not valid', async () => {
    mockFetch({ [acceptUrl]: { status: 404 } })

    renderRoutes(routes, `/workspace-invite/${token}`)

    expect(await screen.findByRole('heading', { name: 'Приглашение недействительно' })).toBeInTheDocument()
  })

  it('says that the workspace has as many members as allowed', async () => {
    mockFetch({ [acceptUrl]: { status: 409, body: { title: 'Limit reached', limit: 200, scope: 'workspace-members' } } })

    renderRoutes(routes, `/workspace-invite/${token}`)

    expect(await screen.findByRole('alert')).toHaveTextContent('В пространстве уже 200 участников')
  })
})
