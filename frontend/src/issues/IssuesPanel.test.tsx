import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import type { IssueLink, TrackerSettings } from '../api/issues.ts'
import { getCells, initializeDocument, writeCell } from '../diagram/model.ts'
import { createQueryClient } from '../queryClient.ts'
import { issueLink } from '../test/issueLinks.ts'
import { mockFetch, type MockResponse } from '../test/render.tsx'
import { IssuesPanel } from './IssuesPanel.tsx'
import { useIssueLinks } from './useIssues.ts'

const boardId = '0199a000-0000-7000-8000-000000000001'
const linksUrl = `/api/boards/${boardId}/issue-links`
const connected: TrackerSettings = {
  available: true,
  tracker: 'github',
  webUrl: 'https://github.com',
  connection: { login: 'alice-gh', connectedAt: '2026-10-01T10:00:00Z', working: true, rejectedAt: null },
}
const fresh = () => new Date().toISOString()

function boardDocument(): Y.Doc {
  const document = new Y.Doc()
  initializeDocument(document)
  writeCell(getCells(document, 'page-1'), {
    id: 'api',
    kind: 'vertex',
    parent: '1',
    order: 'a0',
    value: 'API заказов',
    geometry: null,
    source: null,
    target: null,
    style: {},
  })
  return document
}

interface Setup {
  links?: IssueLink[]
  settings?: TrackerSettings
  canEdit?: boolean
  guest?: boolean
  responses?: Record<string, MockResponse | MockResponse[]>
}

function renderPanel({ links = [], settings = connected, canEdit = true, guest = false, responses = {} }: Setup = {}) {
  const fetchMock = mockFetch({
    [`GET ${linksUrl}`]: { body: links },
    'GET /api/issue-tracker': { body: settings },
    'GET /api/issue-tracker/repositories': { body: [{ fullName: 'acme/shop', private: false }] },
    ...responses,
  })
  const onChanged = vi.fn()
  const onClose = vi.fn()
  const document = boardDocument()
  function Panel() {
    const links = useIssueLinks(boardId)
    return (
      <IssuesPanel
        boardId={boardId}
        request={{ pageId: 'page-1', cellId: 'api' }}
        document={document}
        links={links.data ?? []}
        guest={guest}
        canEdit={canEdit}
        onChanged={onChanged}
        onClose={onClose}
      />
    )
  }
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Panel />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { fetchMock, onChanged, onClose }
}

const bodiesOf = (fetchMock: ReturnType<typeof mockFetch>, method: string, url: string) =>
  fetchMock.mock.calls
    .filter(([input, init]) => (init?.method ?? 'GET') === method && input.toString() === url)
    .map(([, init]) => (init?.body ? JSON.parse(init.body as string) : undefined))

describe('IssuesPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('shows the issues of the element with their state, opens them in GitHub, and an editor unlinks one', async () => {
    const links = [
      issueLink({ syncedAt: fresh() }),
      issueLink({ id: 'link-2', number: 13, title: 'Очередь заказов', state: 'closed', stateReason: 'not-planned', private: true, syncedAt: fresh() }),
      issueLink({ id: 'other', cellId: 'db', title: 'Чужая', syncedAt: fresh() }),
      issueLink({ id: 'deleted', number: 14, title: 'Старое', sync: 'deleted', syncedAt: fresh() }),
    ]
    const { fetchMock, onChanged } = renderPanel({
      links,
      responses: { [`DELETE ${linksUrl}/link-1`]: { status: 204 } },
    })

    const panel = await screen.findByRole('complementary', { name: 'Задачи элемента' })
    expect(within(panel).getByRole('heading')).toHaveTextContent('Задачи «API заказов»')
    const items = await within(panel).findAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(within(items[0]!).getByRole('link', { name: 'Кэш для каталога' })).toHaveAttribute(
      'href',
      'https://github.com/acme/shop/issues/12',
    )
    expect(items[0]).toHaveTextContent('acme/shop#12·Открыта')
    expect(items[1]).toHaveTextContent('Закрыта: не планируется')
    expect(within(items[1]!).getByLabelText('Закрытый репозиторий')).toBeInTheDocument()
    expect(items[2]).toHaveTextContent('Задача удалена в GitHub')
    expect(screen.queryByText('Чужая')).not.toBeInTheDocument()

    await userEvent.click(within(items[0]!).getByRole('button', { name: 'Отвязать acme/shop#12' }))
    await waitFor(() => expect(bodiesOf(fetchMock, 'DELETE', `${linksUrl}/link-1`)).toHaveLength(1))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('links an issue found by the address of its page, telling that a private one is seen by the board', async () => {
    const found = {
      repository: 'acme/secret',
      number: 3,
      title: 'Ротация ключей',
      state: 'open',
      stateReason: null,
      url: 'https://github.com/acme/secret/issues/3',
      private: true,
      updatedAt: '2026-10-09T10:00:00Z',
    }
    const linked = issueLink({ id: 'link-3', repository: 'acme/secret', number: 3, title: 'Ротация ключей', syncedAt: fresh() })
    const { fetchMock, onChanged } = renderPanel({
      responses: {
        'GET /api/issue-tracker/issues?repository=acme%2Fsecret&number=3': { body: found },
        [`POST ${linksUrl}`]: { status: 201, body: linked },
      },
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Привязать задачу' }))
    const window = await screen.findByRole('dialog', { name: 'Привязать задачу' })
    await userEvent.type(within(window).getByLabelText('Задача'), 'https://github.com/acme/secret/issues/3')
    await userEvent.click(within(window).getByRole('button', { name: 'Найти' }))

    const issue = await within(window).findByRole('region', { name: 'Задача' })
    expect(issue).toHaveTextContent('Ротация ключей')
    expect(issue).toHaveTextContent('Репозиторий закрытый: номер, название и статус задачи увидят все, кто может открыть доску.')
    expect(within(window).getByLabelText('Репозиторий')).toHaveValue('acme/secret')

    await userEvent.click(within(issue).getByRole('button', { name: 'Привязать' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(bodiesOf(fetchMock, 'POST', linksUrl)).toEqual([{ pageId: 'page-1', cellId: 'api', repository: 'acme/secret', number: 3 }])
    expect(onChanged).toHaveBeenCalled()
    expect(localStorage.getItem('codraw.issues.repository')).toBe('acme/secret')
  })

  it('searches the issues of the repository by words', async () => {
    localStorage.setItem('codraw.issues.repository', 'acme/shop')
    const result = { ...issueLink(), private: null, updatedAt: '2026-10-09T10:00:00Z' }
    renderPanel({
      responses: {
        'GET /api/issue-tracker/issues?repository=acme%2Fshop&query=%D0%BA%D1%8D%D1%88': { body: [result] },
        'GET /api/issue-tracker/issues?repository=acme%2Fshop&number=12': { body: { ...result, private: false } },
      },
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Привязать задачу' }))
    const window = await screen.findByRole('dialog', { name: 'Привязать задачу' })
    expect(within(window).getByLabelText('Репозиторий')).toHaveValue('acme/shop')
    await userEvent.type(within(window).getByLabelText('Задача'), 'кэш{Enter}')
    await userEvent.click(await within(window).findByRole('button', { name: '#12 Кэш для каталога' }))
    expect(await within(window).findByRole('region', { name: 'Задача' })).toHaveTextContent(
      'Номер, название и статус задачи увидят все, кто может открыть доску.',
    )
  })

  it('creates an issue with the label of the element, and a retry after a failure repeats the same request', async () => {
    localStorage.setItem('codraw.issues.repository', 'acme/shop')
    const created = issueLink({ id: 'link-9', number: 40, title: 'API заказов', createdHere: true, syncedAt: fresh() })
    const { fetchMock } = renderPanel({
      responses: {
        [`POST /api/boards/${boardId}/issues`]: [{ status: 502, body: { reason: 'tracker-unavailable' } }, { status: 201, body: created }],
      },
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Создать задачу' }))
    const window = await screen.findByRole('dialog', { name: 'Создать задачу' })
    expect(within(window).getByLabelText('Название')).toHaveValue('API заказов')
    await userEvent.type(within(window).getByLabelText('Описание'), 'Нужен кэш')
    await userEvent.click(within(window).getByRole('button', { name: 'Создать в GitHub' }))
    expect(await within(window).findByRole('alert')).toHaveTextContent('GitHub не отвечает — попробуйте позже')

    await userEvent.click(within(window).getByRole('button', { name: 'Создать в GitHub' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const requests = bodiesOf(fetchMock, 'POST', `/api/boards/${boardId}/issues`)
    expect(requests).toHaveLength(2)
    expect(requests[0]).toEqual({
      pageId: 'page-1',
      cellId: 'api',
      requestId: expect.any(String),
      repository: 'acme/shop',
      title: 'API заказов',
      description: 'Нужен кэш',
      elementLabel: 'API заказов',
    })
    expect(requests[1].requestId).toBe(requests[0].requestId)
  })

  it('lets a viewer see the issues only, and sends a user without a connection to connect GitHub', async () => {
    renderPanel({ links: [issueLink({ syncedAt: fresh() })], canEdit: false })
    expect(await screen.findByRole('link', { name: 'Кэш для каталога' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Отвязать/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Привязать задачу' })).not.toBeInTheDocument()
    expect(screen.getByText('Привязывать задачи к элементам могут владелец и редакторы доски.')).toBeInTheDocument()
  })

  it('sends a user without a working connection to connect GitHub', async () => {
    renderPanel({ settings: { ...connected, connection: { ...connected.connection!, working: false } } })
    expect(await screen.findByRole('link', { name: 'Подключить заново' })).toHaveAttribute('href', '/settings/connections')
    expect(screen.queryByRole('button', { name: 'Привязать задачу' })).not.toBeInTheDocument()
  })

  it('asks GitHub about links not brought up to date for a while, once, and tells others of a change', async () => {
    const stale = issueLink({ syncedAt: '2026-01-01T00:00:00Z' })
    const { fetchMock, onChanged } = renderPanel({
      links: [stale],
      responses: {
        [`POST ${linksUrl}/refresh`]: { body: [{ ...stale, state: 'closed', stateReason: 'completed', syncedAt: fresh() }] },
      },
    })

    expect(await screen.findByText(/Закрыта: выполнена/)).toBeInTheDocument()
    expect(bodiesOf(fetchMock, 'POST', `${linksUrl}/refresh`)).toEqual([{ ids: ['link-1'] }])
    expect(onChanged).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Обновить из GitHub' }))
    await waitFor(() => expect(bodiesOf(fetchMock, 'POST', `${linksUrl}/refresh`)).toHaveLength(2))
    // Nothing changed this time: nobody is told.
    expect(onChanged).toHaveBeenCalledTimes(1)
  })
})
