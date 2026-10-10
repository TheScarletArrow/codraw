import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Workspace, WorkspaceBoard, WorkspaceMember } from '../api/workspaces.ts'
import { ALICE, mockFetch as mockAnyFetch, renderRoutes, type MockResponse } from '../test/render.tsx'
import { WorkspacePage } from './WorkspacePage.tsx'

const ID = 'w1'
const BOB = { id: 'bob', name: 'Боб', avatarUrl: null }

const workspace = (fields: Partial<Workspace> = {}): Workspace => ({
  id: ID,
  name: 'Платформа',
  role: 'owner',
  createdAt: '2026-10-01T10:00:00Z',
  members: 2,
  boards: 2,
  ...fields,
})

const board = (id: string, title: string, fields: Partial<WorkspaceBoard> = {}): WorkspaceBoard => ({
  id,
  title,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-02T12:30:00Z',
  linkAccess: 'none',
  workspaceAccess: 'edit',
  owner: BOB,
  role: 'owner',
  projectId: null,
  openedAt: null,
  ...fields,
})

const member = (id: string, name: string, role: WorkspaceMember['role']): WorkspaceMember => ({
  id,
  name,
  avatarUrl: null,
  role,
  joinedAt: '2026-10-01T10:00:00Z',
})

const members = [member(ALICE.id, ALICE.name, 'owner'), member('bob', 'Боб', 'editor')]

/** Answers the requests of the page of the workspace, which Alice owns unless given otherwise. */
const mockFetch = (responses: Record<string, MockResponse | MockResponse[]>) =>
  mockAnyFetch({
    'GET /api/me': { body: ALICE },
    [`GET /api/workspaces/${ID}`]: { body: workspace() },
    [`GET /api/workspaces/${ID}/boards`]: {
      body: [board('b1', 'Платежи: схема', { projectId: 'p1' }), board('b2', 'Общая схема')],
    },
    [`GET /api/workspaces/${ID}/projects`]: { body: [{ id: 'p1', name: 'Платежи' }] },
    [`GET /api/workspaces/${ID}/members`]: { body: members },
    [`GET /api/workspaces/${ID}/invites`]: { body: [] },
    'GET /api/workspaces': { body: [] },
    ...responses,
  })

const routes = [
  { path: '/', element: <p>Главная</p> },
  { path: '/workspaces/:workspaceId', element: <WorkspacePage /> },
  { path: '/boards/:boardId', element: <p>Страница доски</p> },
]

describe('WorkspacePage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the boards of the workspace and those of a chosen project', async () => {
    mockFetch({})
    renderRoutes(routes, `/workspaces/${ID}`)

    expect(await screen.findByRole('heading', { name: 'Платформа' })).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Доски пространства' })
    expect(within(list).getAllByRole('link').map((link) => link.textContent)).toEqual(['Платежи: схема', 'Общая схема'])

    await userEvent.click(screen.getByRole('button', { name: 'Платежи' }))
    expect(within(list).getAllByRole('link').map((link) => link.textContent)).toEqual(['Платежи: схема'])
    await userEvent.click(screen.getByRole('button', { name: 'Без проекта' }))
    expect(within(list).getAllByRole('link').map((link) => link.textContent)).toEqual(['Общая схема'])
  })

  it('creates a board in the chosen project and opens it', async () => {
    const fetchMock = mockFetch({
      [`POST /api/workspaces/${ID}/boards`]: {
        status: 201,
        body: { id: 'new', title: 'Новая доска', workspace: { id: ID, name: 'Платформа' } },
      },
    })
    const { router } = renderRoutes(routes, `/workspaces/${ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Платежи' }))
    await userEvent.click(screen.getByRole('button', { name: 'Создать доску' }))

    expect(await screen.findByText('Страница доски')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/boards/new')
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ title: 'Новая доска', projectId: 'p1' })
  })

  it('gives a viewer neither boards to create nor projects and members to manage', async () => {
    mockFetch({
      [`GET /api/workspaces/${ID}`]: { body: workspace({ role: 'viewer' }) },
      [`GET /api/workspaces/${ID}/boards`]: { body: [board('b2', 'Общая схема', { role: 'viewer' })] },
      [`GET /api/workspaces/${ID}/members`]: { body: [member(ALICE.id, ALICE.name, 'viewer'), member('bob', 'Боб', 'owner')] },
    })
    renderRoutes(routes, `/workspaces/${ID}`)

    expect(await screen.findByTitle('Ваша роль')).toHaveTextContent('Читатель')
    await screen.findByRole('link', { name: 'Общая схема' })
    expect(screen.queryByRole('button', { name: 'Создать доску' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Новый проект' })).not.toBeInTheDocument()
    // A viewer copies a board into their own boards, and does nothing else with it.
    await userEvent.click(screen.getByRole('button', { name: 'Меню доски «Общая схема»' }))
    const menu = screen.getByRole('menu', { name: 'Доска «Общая схема»' })
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Создать копию'])
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('combobox', { name: 'Роль: Боб' })).not.toBeInTheDocument()
    expect(screen.queryByText('Пригласить по ссылке')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Покинуть пространство' })).toBeInTheDocument()
  })

  it('lets the owner change the role of a member and take them out', async () => {
    const fetchMock = mockFetch({
      [`PUT /api/workspaces/${ID}/members/bob`]: { body: member('bob', 'Боб', 'admin') },
      [`DELETE /api/workspaces/${ID}/members/bob`]: { status: 204 },
    })
    renderRoutes(routes, `/workspaces/${ID}`)

    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Роль: Боб' }), 'admin')
    await userEvent.click(screen.getByRole('button', { name: 'Убрать: Боб' }))

    await waitFor(() =>
      expect(fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url)}`)).toEqual(
        expect.arrayContaining([`PUT /api/workspaces/${ID}/members/bob`, `DELETE /api/workspaces/${ID}/members/bob`]),
      ),
    )
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ role: 'admin' })
    // The owner does not manage themselves here: they leave or delete the workspace.
    expect(screen.queryByRole('combobox', { name: `Роль: ${ALICE.name}` })).not.toBeInTheDocument()
  })

  it('offers an administrator only the roles of editors and viewers', async () => {
    mockFetch({
      [`GET /api/workspaces/${ID}`]: { body: workspace({ role: 'admin' }) },
      [`GET /api/workspaces/${ID}/members`]: {
        body: [member('carol', 'Кэрол', 'owner'), member(ALICE.id, ALICE.name, 'admin'), member('bob', 'Боб', 'editor')],
      },
    })
    renderRoutes(routes, `/workspaces/${ID}`)

    const role = await screen.findByRole('combobox', { name: 'Роль: Боб' })
    expect(within(role).getAllByRole('option').map((option) => option.textContent)).toEqual(['Редактор', 'Читатель'])
    expect(screen.queryByRole('combobox', { name: 'Роль: Кэрол' })).not.toBeInTheDocument()
    const inviteRole = screen.getByRole('combobox', { name: 'Роль приглашённых' })
    expect(within(inviteRole).getAllByRole('option').map((option) => option.textContent)).toEqual(['Редактор', 'Читатель'])
    expect(screen.queryByRole('button', { name: 'Удалить пространство' })).not.toBeInTheDocument()
  })

  it('tells that the last owner cannot leave', async () => {
    mockFetch({ [`DELETE /api/workspaces/${ID}/members/${ALICE.id}`]: { status: 409, body: { title: 'Last owner' } } })
    renderRoutes(routes, `/workspaces/${ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Покинуть пространство' }))
    await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Уход из пространства' })).getByRole('button', { name: 'Покинуть' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('В пространстве должен остаться владелец')
  })

  it('creates an invitation link with a role', async () => {
    const invite = { id: 'i1', path: '/workspace-invite/AAAAAAAAAAAAAAAAAAAAAA', role: 'viewer', createdAt: '2026-10-02T10:00:00Z' }
    const fetchMock = mockFetch({
      [`GET /api/workspaces/${ID}/invites`]: [{ body: [] }, { body: [invite] }],
      [`POST /api/workspaces/${ID}/invites`]: { status: 201, body: invite },
    })
    renderRoutes(routes, `/workspaces/${ID}`)

    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Роль приглашённых' }), 'viewer')
    await userEvent.click(screen.getByRole('button', { name: 'Создать ссылку' }))

    const link = await screen.findByRole('textbox', { name: 'Ссылка-приглашение' })
    expect(link).toHaveValue(`${window.location.origin}/workspace-invite/AAAAAAAAAAAAAAAAAAAAAA`)
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ role: 'viewer' })
  })

  it('moves a board into a project from its menu', async () => {
    const fetchMock = mockFetch({
      'PUT /api/boards/b2/workspace': { body: { id: 'b2', title: 'Общая схема', projectId: 'p1' } },
    })
    renderRoutes(routes, `/workspaces/${ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Меню доски «Общая схема»' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Переместить в проект' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Платежи' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true))
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ workspaceId: ID, projectId: 'p1' })
  })

  it('copies a board from its menu and opens the copy', async () => {
    const fetchMock = mockFetch({
      'POST /api/boards/b2/copy': { status: 201, body: { id: 'copy', title: 'Общая схема (копия)' } },
    })
    const { router } = renderRoutes(routes, `/workspaces/${ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Меню доски «Общая схема»' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Создать копию' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/boards/copy'))
    expect(fetchMock.mock.calls.some(([url, init]) => init?.method === 'POST' && String(url) === '/api/boards/b2/copy')).toBe(true)
  })

  it('deletes the workspace after a confirmation and goes to the main page', async () => {
    const fetchMock = mockFetch({ [`DELETE /api/workspaces/${ID}`]: { status: 204 } })
    const { router } = renderRoutes(routes, `/workspaces/${ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Удалить пространство' }))
    await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Удаление пространства' })).getByRole('button', { name: 'Удалить' }))

    expect(await screen.findByText('Главная')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(fetchMock.mock.calls.some(([url, init]) => init?.method === 'DELETE' && String(url) === `/api/workspaces/${ID}`)).toBe(true)
  })

  it('tells that a workspace is not found', async () => {
    mockFetch({ [`GET /api/workspaces/${ID}`]: { status: 404 } })
    renderRoutes(routes, `/workspaces/${ID}`)

    expect(await screen.findByRole('heading', { name: 'Пространство не найдено' })).toBeInTheDocument()
  })
})
