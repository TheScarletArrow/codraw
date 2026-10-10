import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DeletionPreview } from '../api/account.ts'
import { ALICE, mockFetch, renderRoutes, type MockResponse } from '../test/render.tsx'
import { AccountPage } from './AccountPage.tsx'
import { LoginPage } from './LoginPage.tsx'

const nothingShared: DeletionPreview = { sharedBoards: [], blockingWorkspaces: [], deletedBoards: 2 }
const shared: DeletionPreview = {
  sharedBoards: [
    {
      id: 'b1',
      title: 'Схема',
      members: [{ id: 'bob', name: 'Боб', avatarUrl: null, role: 'editor' }],
      visitors: 0,
    },
    { id: 'b2', title: 'По ссылке', members: [], visitors: 3 },
  ],
  blockingWorkspaces: [],
  deletedBoards: 0,
}

const routes = [
  { path: '/settings/account', element: <AccountPage /> },
  { path: '/login', element: <LoginPage /> },
]

function renderPage(responses: Record<string, MockResponse | MockResponse[]>) {
  const fetchMock = mockFetch({ 'GET /api/me': { body: ALICE }, ...responses })
  renderRoutes(routes, '/settings/account')
  return fetchMock
}

const requests = (fetchMock: ReturnType<typeof mockFetch>, method: string, url: string) =>
  fetchMock.mock.calls.filter(([input, init]) => (init?.method ?? 'GET') === method && input.toString() === url)

describe('AccountPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('deletes the account only once the word is typed, and opens the login page that says so', async () => {
    const fetchMock = renderPage({
      'GET /api/me/deletion': { body: nothingShared },
      'DELETE /api/me': { status: 204 },
    })

    expect(await screen.findByText(/Удалятся досок без других участников и из корзины: 2/)).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Удалить учётную запись' })
    expect(button).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Чтобы подтвердить, введите слово «удалить»'), 'удалить')
    await userEvent.click(button)

    expect(await screen.findByRole('status')).toHaveTextContent('Учётная запись удалена')
    expect(JSON.parse(requests(fetchMock, 'DELETE', '/api/me')[0]![1]!.body as string)).toEqual({ boards: [] })
  })

  it('asks what becomes of each board that others work on, and sends the decisions', async () => {
    const fetchMock = renderPage({
      'GET /api/me/deletion': { body: shared },
      'DELETE /api/me': { status: 204 },
    })

    const schema = await screen.findByLabelText('Схема')
    expect(within(schema).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Выберите…',
      'Передать: Боб',
      'Удалить доску',
    ])
    expect(screen.getByText(/Доску открывали по ссылке \(3\)/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Чтобы подтвердить, введите слово «удалить»'), 'удалить')
    const button = screen.getByRole('button', { name: 'Удалить учётную запись' })
    expect(button).toBeDisabled()

    await userEvent.selectOptions(schema, 'Передать: Боб')
    await userEvent.selectOptions(screen.getByLabelText('По ссылке'), 'Удалить доску')
    await userEvent.click(button)

    await waitFor(() => expect(requests(fetchMock, 'DELETE', '/api/me')).toHaveLength(1))
    expect(JSON.parse(requests(fetchMock, 'DELETE', '/api/me')[0]![1]!.body as string)).toEqual({
      boards: [
        { boardId: 'b1', action: 'transfer', newOwnerId: 'bob' },
        { boardId: 'b2', action: 'delete' },
      ],
    })
  })

  it('does not delete the only owner of a workspace with others, and links the workspace', async () => {
    renderPage({
      'GET /api/me/deletion': { body: { ...nothingShared, blockingWorkspaces: [{ id: 'w1', name: 'Платформа' }] } },
    })

    expect(await screen.findByRole('link', { name: 'Платформа' })).toHaveAttribute('href', '/workspaces/w1')
    await userEvent.type(screen.getByLabelText('Чтобы подтвердить, введите слово «удалить»'), 'удалить')
    expect(screen.getByRole('button', { name: 'Удалить учётную запись' })).toBeDisabled()
  })

  it('tells that the export reached its limit for the day', async () => {
    renderPage({
      'GET /api/me/deletion': { body: nothingShared },
      'POST /api/me/export': { status: 429 },
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Скачать мои данные' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Слишком много выгрузок за сутки')
  })
})
