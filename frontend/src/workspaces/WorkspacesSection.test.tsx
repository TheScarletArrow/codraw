import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ListedBoard } from '../api/boards.ts'
import type { Workspace } from '../api/workspaces.ts'
import { BoardsPage } from '../pages/BoardsPage.tsx'
import { ALICE, mockFetch as mockAnyFetch, renderRoutes, type MockResponse } from '../test/render.tsx'

const workspace = (id: string, name: string, fields: Partial<Workspace> = {}): Workspace => ({
  id,
  name,
  role: 'owner',
  createdAt: '2026-10-01T10:00:00Z',
  members: 3,
  boards: 2,
  ...fields,
})

const board: ListedBoard = {
  id: 'b1',
  title: 'Схема',
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-02T12:30:00Z',
  linkAccess: 'edit',
  owner: { id: ALICE.id, name: ALICE.name, avatarUrl: ALICE.avatarUrl },
  role: 'owner',
  openedAt: null,
  tags: [],
  folderId: null,
}

/** Answers the requests of the main page; the user is Alice, signed in through a provider. */
const mockFetch = (responses: Record<string, MockResponse | MockResponse[]>) =>
  mockAnyFetch({
    'GET /api/me': { body: ALICE },
    'GET /api/boards': { body: [board] },
    'GET /api/boards/shared': { body: [] },
    'GET /api/boards/folders': { body: [] },
    ...responses,
  })

const routes = [
  { path: '/', element: <BoardsPage /> },
  { path: '/workspaces/:workspaceId', element: <p>Страница пространства</p> },
  { path: '/login', element: <p>Вход</p> },
]

describe('Workspaces on the main page', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists the workspaces of the user with their roles and counts', async () => {
    mockFetch({
      'GET /api/workspaces': {
        body: [workspace('w1', 'Платформа'), workspace('w2', 'Аналитика', { role: 'viewer', boards: 1, members: 5 })],
      },
    })

    renderRoutes(routes)

    const section = await screen.findByRole('region', { name: 'Пространства' })
    expect(await within(section).findByRole('link', { name: /Платформа/ })).toHaveAttribute('href', '/workspaces/w1')
    expect(within(section).getByRole('link', { name: /Аналитика/ })).toHaveTextContent('Читатель · 1 доска · 5 участников')
  })

  it('creates a workspace and opens it', async () => {
    const fetchMock = mockFetch({
      'GET /api/workspaces': { body: [] },
      'POST /api/workspaces': { status: 201, body: workspace('w3', 'Платформа') },
    })
    const { router } = renderRoutes(routes)

    await userEvent.click(await screen.findByRole('button', { name: 'Создать пространство' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Название пространства' }), 'Платформа{Enter}')

    expect(await screen.findByText('Страница пространства')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/workspaces/w3')
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ name: 'Платформа' })
  })

  it('tells that a user is in as many workspaces as allowed', async () => {
    mockFetch({
      'GET /api/workspaces': { body: [] },
      'POST /api/workspaces': { status: 409, body: { title: 'Limit reached', limit: 20, scope: 'workspaces' } },
    })
    renderRoutes(routes)

    await userEvent.click(await screen.findByRole('button', { name: 'Создать пространство' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Название пространства' }), 'Ещё одно{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Можно состоять не больше чем в 20 пространствах')
  })

  it('offers a guest to sign in instead', async () => {
    const fetchMock = mockFetch({ 'GET /api/me': { body: { ...ALICE, guest: true } } })

    renderRoutes(routes)

    expect(await screen.findByText(/Командные пространства с общими проектами доступны после входа/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Создать пространство' })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/workspaces')).toBe(false)
  })

  it('brings a personal board into a workspace where the user edits, from the menu of the board', async () => {
    const fetchMock = mockFetch({
      'GET /api/workspaces': {
        body: [workspace('w1', 'Платформа', { role: 'editor' }), workspace('w2', 'Архив', { role: 'viewer' })],
      },
      'GET /api/boards': [{ body: [board] }, { body: [] }],
      'PUT /api/boards/b1/workspace': { body: { ...board, workspace: { id: 'w1', name: 'Платформа' } } },
    })
    renderRoutes(routes)

    await userEvent.click(await screen.findByRole('button', { name: 'Меню доски «Схема»' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Перенести в пространство' }))
    const menu = await screen.findByRole('menu', { name: 'Пространство для доски «Схема»' })
    expect(within(menu).queryByRole('menuitem', { name: /Архив/ })).not.toBeInTheDocument()
    await userEvent.click(within(menu).getByRole('menuitem', { name: /Платформа/ }))

    await waitFor(() => expect(screen.queryByRole('link', { name: 'Схема' })).not.toBeInTheDocument())
    const put = fetchMock.mock.calls.find(([url]) => String(url) === '/api/boards/b1/workspace')
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ workspaceId: 'w1', projectId: null })
  })
})
