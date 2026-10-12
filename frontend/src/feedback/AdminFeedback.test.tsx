import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminAction, AdminUser } from '../api/admin.ts'
import type { Feedback } from '../api/feedback.ts'
import { AdminPage } from '../pages/AdminPage.tsx'
import { ALICE, mockFetch, renderRoutes, type MockResponse } from '../test/render.tsx'

const ADMIN = { ...ALICE, id: 'admin', name: 'Админ', admin: true }

const bug: Feedback = {
  id: 'feedback-1',
  author: { id: 'bob', name: 'Боб', guest: false },
  kind: 'bug',
  text: 'Не сохраняется подпись фигуры',
  page: '/boards/42',
  appVersion: '0.43.0',
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
  createdAt: '2026-10-12T10:00:00Z',
  resolvedAt: null,
  resolvedBy: null,
}
const idea: Feedback = {
  ...bug,
  id: 'feedback-2',
  author: null,
  kind: 'idea',
  text: 'Тёмная тема для печати',
  page: null,
  appVersion: null,
  userAgent: null,
}
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

function renderPage(responses: Record<string, MockResponse | MockResponse[]>) {
  const fetchMock = mockFetch({ 'GET /api/me': { body: ADMIN }, 'GET /api/admin/reports?status=open': { body: [] }, ...responses })
  renderRoutes([{ path: '/admin', element: <AdminPage /> }], '/admin')
  return fetchMock
}

const calls = (fetchMock: ReturnType<typeof mockFetch>, method: string, url: string) =>
  fetchMock.mock.calls.filter(([input, init]) => (init?.method ?? 'GET') === method && input.toString() === url)

describe('AdminFeedback', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the open feedback with its author, kind, page, version and browser, and closes one', async () => {
    const fetchMock = renderPage({
      'GET /api/admin/feedback?status=open': [{ body: [idea, bug] }, { body: [idea] }],
      'POST /api/admin/feedback/feedback-1/resolve': { body: { ...bug, resolvedAt: '2026-10-12T11:00:00Z', resolvedBy: 'Админ' } },
    })
    await userEvent.click(await screen.findByRole('tab', { name: 'Отзывы' }))

    const list = await screen.findByRole('list', { name: 'Открытые отзывы' })
    const [first, second] = within(list).getAllByRole('listitem')
    expect(first).toHaveTextContent('Идея')
    expect(first).toHaveTextContent('Удалённый пользователь')
    expect(first).toHaveTextContent('Тёмная тема для печати')
    expect(second).toHaveTextContent('Ошибка')
    expect(second).toHaveTextContent('Не сохраняется подпись фигуры')
    expect(second).toHaveTextContent('Страница /boards/42 · версия 0.43.0 · браузер Mozilla/5.0 (X11; Linux x86_64)')
    expect(within(second).getByRole('button', { name: 'Боб' })).toBeInTheDocument()

    await userEvent.click(within(second!).getByRole('button', { name: 'Закрыть' }))

    await waitFor(() => expect(calls(fetchMock, 'POST', '/api/admin/feedback/feedback-1/resolve')).toHaveLength(1))
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Открытые отзывы' })).getAllByRole('listitem')).toHaveLength(1))
  })

  it('shows the closed feedback with who closed it', async () => {
    renderPage({
      'GET /api/admin/feedback?status=open': { body: [] },
      'GET /api/admin/feedback?status=resolved': { body: [{ ...bug, resolvedAt: '2026-10-12T11:00:00Z', resolvedBy: 'Админ' }] },
    })
    await userEvent.click(await screen.findByRole('tab', { name: 'Отзывы' }))
    expect(await screen.findByText('Открытых отзывов нет')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Закрытые' }))

    const list = await screen.findByRole('list', { name: 'Закрытые отзывы' })
    expect(list).toHaveTextContent(/Закрыт .*, Админ/)
    expect(within(list).queryByRole('button', { name: 'Закрыть' })).toBeNull()
  })

  it('opens the author in «Пользователи»', async () => {
    const fetchMock = renderPage({
      'GET /api/admin/feedback?status=open': { body: [bug] },
      'GET /api/admin/users?query=bob': { body: [bob] },
    })
    await userEvent.click(await screen.findByRole('tab', { name: 'Отзывы' }))

    await userEvent.click(await screen.findByRole('button', { name: 'Боб' }))

    expect(screen.getByRole('tab', { name: 'Пользователи' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('textbox', { name: 'Имя, id или id у GitHub и Google' })).toHaveValue('bob')
    expect(await screen.findByRole('list', { name: 'Пользователи' })).toHaveTextContent('github:583231')
    expect(calls(fetchMock, 'GET', '/api/admin/users?query=bob')).toHaveLength(1)
  })

  it('names closed feedback in the journal by the beginning of its text', async () => {
    const action: AdminAction = {
      id: 'action-1',
      adminId: 'admin',
      adminName: 'Админ',
      action: 'resolve-feedback',
      targetKind: 'feedback',
      targetId: 'feedback-1',
      targetLabel: 'Не сохраняется подпись фигуры',
      details: null,
      createdAt: '2026-10-12T11:00:00Z',
    }
    renderPage({ 'GET /api/admin/actions': { body: [action] } })
    await userEvent.click(await screen.findByRole('tab', { name: 'Журнал' }))

    const journal = await screen.findByRole('table', { name: 'Журнал действий администраторов' })
    expect(journal).toHaveTextContent('Закрыть отзыв')
    expect(journal).toHaveTextContent('Отзыв «Не сохраняется подпись фигуры»')
  })
})
