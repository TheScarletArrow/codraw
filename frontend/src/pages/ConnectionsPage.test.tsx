import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TrackerSettings } from '../api/issues.ts'
import { ALICE, mockFetch, renderRoutes, type MockResponse } from '../test/render.tsx'
import { ConnectionsPage } from './ConnectionsPage.tsx'

const settingsUrl = '/api/issue-tracker'
const notConnected: TrackerSettings = { available: true, tracker: 'github', webUrl: 'https://github.com', connection: null }
const connection = { login: 'alice-gh', connectedAt: '2026-10-01T10:00:00Z', working: true, rejectedAt: null }

const routes = [
  { path: '/settings/connections', element: <ConnectionsPage /> },
  { path: '/login', element: <p>Вход</p> },
]

function renderPage(responses: Record<string, MockResponse | MockResponse[]>) {
  const fetchMock = mockFetch({ 'GET /api/me': { body: ALICE }, ...responses })
  renderRoutes(routes, '/settings/connections')
  return fetchMock
}

const requests = (fetchMock: ReturnType<typeof mockFetch>, method: string, url: string) =>
  fetchMock.mock.calls.filter(([input, init]) => (init?.method ?? 'GET') === method && input.toString() === url)

describe('ConnectionsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('connects GitHub with a token, which it never shows again', async () => {
    const fetchMock = renderPage({
      [`GET ${settingsUrl}`]: [{ body: notConnected }, { body: { ...notConnected, connection } }],
      [`PUT ${settingsUrl}/connection`]: { body: connection },
    })

    const form = within(await screen.findByRole('form', { name: 'GitHub' }))
    expect(form.getByRole('link', { name: 'fine-grained токен' })).toHaveAttribute(
      'href',
      'https://github.com/settings/personal-access-tokens/new',
    )
    const token = form.getByLabelText('Токен доступа')
    expect(token).toHaveAttribute('type', 'password')
    await userEvent.type(token, 'github_pat_secret')
    await userEvent.click(form.getByRole('button', { name: 'Подключить' }))

    expect(await screen.findByText('alice-gh')).toBeInTheDocument()
    expect(screen.getByText(/Подключено/)).toBeInTheDocument()
    expect(screen.getByLabelText('Новый токен')).toHaveValue('')
    expect(JSON.parse(requests(fetchMock, 'PUT', `${settingsUrl}/connection`)[0]![1]!.body as string)).toEqual({
      token: 'github_pat_secret',
    })
  })

  it('tells that GitHub refused the token, and disconnects', async () => {
    const fetchMock = renderPage({
      [`GET ${settingsUrl}`]: [
        { body: { ...notConnected, connection: { ...connection, working: false, rejectedAt: '2026-10-08T10:00:00Z' } } },
        { body: notConnected },
      ],
      [`PUT ${settingsUrl}/connection`]: { status: 400, body: { reason: 'invalid-token' } },
      [`DELETE ${settingsUrl}/connection`]: { status: 204 },
    })

    expect(await screen.findByText(/GitHub больше не принимает токен/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Новый токен'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Заменить токен' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('GitHub не принял токен')

    await userEvent.click(screen.getByRole('button', { name: 'Отключить' }))
    await waitFor(() => expect(requests(fetchMock, 'DELETE', `${settingsUrl}/connection`)).toHaveLength(1))
    expect(await screen.findByRole('button', { name: 'Подключить' })).toBeInTheDocument()
  })

  it('says that the server links no issues, and offers a guest to sign in', async () => {
    renderPage({ [`GET ${settingsUrl}`]: { body: { ...notConnected, available: false, webUrl: null } } })
    expect(await screen.findByText('На этом сервере задачи GitHub не подключены.')).toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('asks a guest to sign in and nothing else', async () => {
    const fetchMock = renderPage({ 'GET /api/me': { body: { ...ALICE, guest: true } } })
    expect(await screen.findByText(/Подключения доступны после входа через GitHub или Google/)).toBeInTheDocument()
    expect(requests(fetchMock, 'GET', settingsUrl)).toHaveLength(0)
  })
})
