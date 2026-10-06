import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../api/boards.ts'
import { mockFetch, renderRoutes } from '../test/render.tsx'
import { InvitePage } from './InvitePage.tsx'

const token = 'AAAAAAAAAAAAAAAAAAAAAA'
const acceptUrl = `POST /api/invites/${token}/accept`
const board: Board = {
  id: '0199a000-0000-7000-8000-000000000001',
  title: 'Архитектура',
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
  linkAccess: 'none',
  owner: { id: 'alice', name: 'Алиса', avatarUrl: null },
  role: 'editor',
}
const routes = [
  { path: '/', element: <p>Список досок</p> },
  { path: '/invite/:token', element: <InvitePage /> },
  { path: '/boards/:boardId', element: <p>Страница доски</p> },
]

describe('InvitePage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('accepts the invitation once and opens the board in place of the invitation', async () => {
    const fetchMock = mockFetch({ [acceptUrl]: { body: board } })

    const { router } = renderRoutes(routes, `/invite/${token}`)

    expect(await screen.findByText('Страница доски')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/boards/${board.id}`)
    expect(router.state.historyAction).toBe('REPLACE')
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  })

  it('says that a revoked or unknown invitation is not valid, with a way to the list of boards', async () => {
    mockFetch({ [acceptUrl]: { status: 404 } })

    renderRoutes(routes, `/invite/${token}`)

    expect(await screen.findByRole('heading', { name: 'Приглашение недействительно' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'К списку досок' })).toHaveAttribute('href', '/')
  })

  it('says that the board has as many members as allowed', async () => {
    mockFetch({ [acceptUrl]: { status: 409, body: { title: 'Member limit reached', limit: 100 } } })

    renderRoutes(routes, `/invite/${token}`)

    expect(await screen.findByRole('alert')).toHaveTextContent('На доске уже 100 участников: владелец не может добавить больше.')
  })

  it('shows that it accepts the invitation meanwhile', async () => {
    mockFetch({ [acceptUrl]: { body: board } })

    renderRoutes(routes, `/invite/${token}`)

    expect(screen.getByText('Принимаем приглашение…')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Страница доски')).toBeInTheDocument())
  })
})
