import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminAction, AdminBoard, AdminBoardDetails, AdminUser, BoardReport } from '../api/admin.ts'
import { ALICE, mockFetch, renderRoutes, type MockResponse } from '../test/render.tsx'
import { AdminPage } from './AdminPage.tsx'

const ADMIN = { ...ALICE, id: 'admin', name: 'Админ', admin: true }
const routes = [{ path: '/admin', element: <AdminPage /> }]

const bob: AdminUser = {
  id: 'bob',
  name: 'Боб',
  avatarUrl: null,
  provider: 'github',
  providerUserId: '583231',
  guest: false,
  admin: false,
  createdAt: '2026-10-01T10:00:00Z',
  blockedAt: null,
  boards: 3,
}
const board: AdminBoard = {
  id: 'board-1',
  title: 'Бесплатный хостинг',
  owner: { id: 'bob', name: 'Боб' },
  linkAccess: 'public',
  embed: true,
  sharingBlocked: false,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-02T10:00:00Z',
  deletedAt: null,
  openReports: 1,
}
const report: BoardReport = {
  id: 'report-1',
  board: { id: board.id, title: board.title, owner: board.owner, linkAccess: 'public', sharingBlocked: false, deletedAt: null },
  reason: 'spam',
  message: 'Реклама казино',
  reporter: null,
  createdAt: '2026-10-03T10:00:00Z',
  resolvedAt: null,
  resolvedBy: null,
}
const details = (changes: Partial<AdminBoard> = {}): AdminBoardDetails => ({
  board: { ...board, ...changes },
  workspace: null,
  sizes: { document: 2048, versions: 0, versionCount: 0, images: 3 * 1024 * 1024, imageCount: 2 },
  embed: changes.sharingBlocked ? null : { path: '/api/embeds/AAAAAAAAAAAAAAAAAAAAAA.svg', updatedAt: null },
  reports: changes.sharingBlocked ? [] : [report],
})
const action: AdminAction = {
  id: 'action-1',
  adminId: 'admin',
  adminName: 'Админ',
  action: 'block-user',
  targetKind: 'user',
  targetId: 'bob',
  targetLabel: 'Боб',
  details: null,
  createdAt: '2026-10-03T11:00:00Z',
}

function renderPage(responses: Record<string, MockResponse | MockResponse[]>) {
  const fetchMock = mockFetch({ 'GET /api/me': { body: ADMIN }, 'GET /api/admin/reports?status=open': { body: [report] }, ...responses })
  renderRoutes(routes, '/admin')
  return fetchMock
}

const calls = (fetchMock: ReturnType<typeof mockFetch>, method: string, url: string) =>
  fetchMock.mock.calls.filter(([input, init]) => (init?.method ?? 'GET') === method && input.toString() === url)

describe('AdminPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('tells anybody but an administrator that they have no access, without asking the API of administration', async () => {
    const fetchMock = mockFetch({ 'GET /api/me': { body: ALICE } })
    renderRoutes(routes, '/admin')

    expect(await screen.findByRole('heading', { name: 'Нет доступа' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.map(([input]) => input.toString())).toEqual(['/api/me'])
  })

  it('shows the open reports and closes one', async () => {
    const fetchMock = renderPage({ 'POST /api/admin/reports/report-1/resolve': { body: { ...report, resolvedAt: '2026-10-03T12:00:00Z' } } })

    const list = await screen.findByRole('list', { name: 'Открытые жалобы' })
    expect(list).toHaveTextContent('Бесплатный хостинг')
    expect(list).toHaveTextContent('Спам или реклама: Реклама казино')
    expect(list).toHaveTextContent('Отправлена без входа')

    await userEvent.click(within(list).getByRole('button', { name: 'Закрыть жалобу' }))

    await waitFor(() => expect(calls(fetchMock, 'POST', '/api/admin/reports/report-1/resolve')).toHaveLength(1))
  })

  it('finds a user and blocks them once the administrator confirms it', async () => {
    const fetchMock = renderPage({
      'GET /api/admin/users': { body: [bob] },
      'GET /api/admin/users?query=%D0%B1%D0%BE%D0%B1': [{ body: [bob] }, { body: [{ ...bob, blockedAt: '2026-10-03T12:00:00Z' }] }],
      'POST /api/admin/users/bob/block': { body: { ...bob, blockedAt: '2026-10-03T12:00:00Z' } },
    })
    await userEvent.click(await screen.findByRole('tab', { name: 'Пользователи' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Имя, id или id у GitHub и Google' }), 'боб')
    await userEvent.click(screen.getByRole('button', { name: 'Найти' }))
    const users = await screen.findByRole('list', { name: 'Пользователи' })
    await waitFor(() => expect(calls(fetchMock, 'GET', '/api/admin/users?query=%D0%B1%D0%BE%D0%B1')).toHaveLength(1))
    expect(users).toHaveTextContent('github:583231 · 3 досок')

    await userEvent.click(within(users).getByRole('button', { name: 'Заблокировать' }))
    const confirmation = screen.getByRole('alertdialog', { name: 'Заблокировать Боб?' })
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Заблокировать' }))

    await waitFor(() => expect(calls(fetchMock, 'POST', '/api/admin/users/bob/block')).toHaveLength(1))
    expect(await screen.findByText(/Заблокирован\(а\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Разблокировать' })).toBeInTheDocument()
  })

  it('deletes an account once the administrator confirms it, and says why it cannot when a workspace needs its owner', async () => {
    const fetchMock = renderPage({
      'GET /api/admin/users': [{ body: [bob] }, { body: [] }],
      'DELETE /api/admin/users/bob': [
        { status: 409, body: { reason: 'sole-workspace-owner' } },
        { status: 204 },
      ],
    })
    await userEvent.click(await screen.findByRole('tab', { name: 'Пользователи' }))
    const users = await screen.findByRole('list', { name: 'Пользователи' })

    await userEvent.click(within(users).getByRole('button', { name: 'Удалить' }))
    await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Удалить учётную запись Боб?' })).getByRole('button', { name: 'Удалить навсегда' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('единственный владелец пространства')
    await userEvent.click(within(users).getByRole('button', { name: 'Удалить' }))
    await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Удалить учётную запись Боб?' })).getByRole('button', { name: 'Удалить навсегда' }))

    await waitFor(() => expect(calls(fetchMock, 'DELETE', '/api/admin/users/bob')).toHaveLength(2))
    expect(await screen.findByText('Никого не нашлось')).toBeInTheDocument()
  })

  it('offers no blocking of an administrator', async () => {
    renderPage({ 'GET /api/admin/users': { body: [{ ...bob, admin: true }] } })
    await userEvent.click(await screen.findByRole('tab', { name: 'Пользователи' }))

    const users = await screen.findByRole('list', { name: 'Пользователи' })
    expect(users).toHaveTextContent('Администратор')
    expect(within(users).queryByRole('button')).toBeNull()
  })

  it('opens the board of a report with its owner, size and live image, and closes its sharing', async () => {
    const fetchMock = renderPage({
      'GET /api/admin/boards': { body: [board] },
      'GET /api/admin/boards/board-1': [{ body: details() }, { body: details({ sharingBlocked: true, linkAccess: 'none', embed: false }) }],
      'POST /api/admin/boards/board-1/sharing-block': { body: details({ sharingBlocked: true, linkAccess: 'none', embed: false }) },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Сведения о доске' }))

    const section = await screen.findByRole('region', { name: 'Доска «Бесплатный хостинг»' })
    expect(section).toHaveTextContent('ВладелецБоб')
    expect(section).toHaveTextContent('Все, у кого есть ссылка, без входа')
    expect(section).toHaveTextContent('/api/embeds/AAAAAAAAAAAAAAAAAAAAAA.svg')
    expect(section).toHaveTextContent('документ 2.0 КБ, версии 0 Б (0), картинки 3.0 МБ (2)')

    await userEvent.click(within(section).getByRole('button', { name: 'Закрыть доступ по ссылке' }))
    await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Закрыть доступ по ссылке?' })).getByRole('button', { name: 'Закрыть' }))

    await waitFor(() => expect(calls(fetchMock, 'POST', '/api/admin/boards/board-1/sharing-block')).toHaveLength(1))
    expect(await within(section).findByRole('button', { name: 'Снять запрет' })).toBeInTheDocument()
    expect(section).toHaveTextContent('Только участники · закрыт администратором')
  })

  it('shows the journal of the administrators', async () => {
    renderPage({ 'GET /api/admin/actions': { body: [action] } })
    await userEvent.click(await screen.findByRole('tab', { name: 'Журнал' }))

    const journal = await screen.findByRole('table', { name: 'Журнал действий администраторов' })
    expect(journal).toHaveTextContent('Админ')
    expect(journal).toHaveTextContent('Заблокировать')
    expect(journal).toHaveTextContent('Пользователь «Боб»')
  })
})
