import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EmailChannel, NotificationSettings, WebhookChannel } from '../api/notificationSettings.ts'
import { ALICE, mockFetch, renderRoutes, type MockResponse } from '../test/render.tsx'
import { NotificationSettingsPage } from './NotificationSettingsPage.tsx'

const settingsUrl = '/api/notification-settings'
const boardId = '0199a000-0000-7000-8000-000000000001'

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const empty: NotificationSettings = {
  email: { available: true, channel: null },
  webhook: { available: true, hosts: ['hooks.slack.com'], channel: null },
  mutedBoards: [],
}

const emailChannel = (changes: Partial<EmailChannel> = {}): EmailChannel => ({
  address: 'alice@example.com',
  verified: true,
  verificationSentAt: minutesAgo(10),
  enabled: true,
  events: ['mentions', 'replies', 'assignments', 'access', 'reviews'],
  lastDeliveredAt: null,
  lastError: null,
  lastErrorAt: null,
  ...changes,
})

const webhookChannel = (changes: Partial<WebhookChannel> = {}): WebhookChannel => ({
  addressHint: 'https://hooks.slack.com/…1234',
  enabled: true,
  events: ['mentions'],
  lastDeliveredAt: null,
  lastError: null,
  lastErrorAt: null,
  ...changes,
})

const routes = [
  { path: '/settings/notifications', element: <NotificationSettingsPage /> },
  { path: '/login', element: <p>Вход</p> },
  { path: '/boards/:boardId', element: <p>Доска</p> },
]

function renderPage(responses: Record<string, MockResponse | MockResponse[]>, search = '') {
  const fetchMock = mockFetch({ 'GET /api/me': { body: ALICE }, ...responses })
  const { router } = renderRoutes(routes, `/settings/notifications${search}`)
  return { fetchMock, router }
}

const requests = (fetchMock: ReturnType<typeof mockFetch>, method: string, url: string) =>
  fetchMock.mock.calls.filter(([input, init]) => (init?.method ?? 'GET') === method && input.toString() === url)

const bodyOf = (call: Parameters<typeof fetch>) => JSON.parse(call[1]!.body as string) as unknown

const section = (name: string) => within(screen.getByRole('form', { name }))

describe('NotificationSettingsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers a guest to sign in and asks for no settings', async () => {
    const { fetchMock } = renderPage({ 'GET /api/me': { body: { ...ALICE, guest: true } } })

    expect(await screen.findByText(/доступны после входа через GitHub или Google/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/login')
    expect(requests(fetchMock, 'GET', settingsUrl)).toHaveLength(0)
  })

  it('says which channels the server does not have', async () => {
    renderPage({
      [`GET ${settingsUrl}`]: {
        body: { ...empty, email: { available: false, channel: null }, webhook: { available: false, hosts: [], channel: null } },
      },
    })

    expect(await screen.findByText('Почта на этом сервере не настроена')).toBeInTheDocument()
    expect(screen.getByText('Чаты на этом сервере не настроены')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Почта' })).not.toBeInTheDocument()
  })

  it('saves a new address with the chosen events and tells to open the link of the letter, which goes again on request', async () => {
    const unconfirmed = { ...empty, email: { available: true, channel: emailChannel({ verified: false, verificationSentAt: minutesAgo(0) }) } }
    const { fetchMock } = renderPage({
      [`GET ${settingsUrl}`]: [{ body: empty }, { body: unconfirmed }],
      [`PUT ${settingsUrl}/email`]: { body: unconfirmed.email.channel },
      [`POST ${settingsUrl}/email/resend`]: { body: unconfirmed.email.channel },
    })

    await userEvent.type(await screen.findByRole('textbox', { name: 'Адрес' }), 'alice@example.com')
    const email = section('Почта')
    await userEvent.click(email.getByRole('checkbox', { name: /Доступ к доскам/ }))
    await userEvent.click(email.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByText(/Адрес не подтверждён — откройте ссылку из письма, отправленного на alice@example.com/)).toBeInTheDocument()
    expect(bodyOf(requests(fetchMock, 'PUT', `${settingsUrl}/email`)[0])).toEqual({
      address: 'alice@example.com',
      enabled: true,
      events: ['mentions', 'replies', 'assignments', 'reviews'],
    })

    await userEvent.click(screen.getByRole('button', { name: 'Отправить письмо ещё раз' }))
    await waitFor(() => expect(requests(fetchMock, 'POST', `${settingsUrl}/email/resend`)).toHaveLength(1))
  })

  it('tells why an address or a webhook is not taken', async () => {
    renderPage({
      [`GET ${settingsUrl}`]: { body: empty },
      [`PUT ${settingsUrl}/email`]: { status: 429, body: { reason: 'confirmation-limit' } },
      [`PUT ${settingsUrl}/webhook`]: { status: 400, body: { reason: 'host-not-allowed' } },
    })

    await userEvent.type(await screen.findByRole('textbox', { name: 'Адрес' }), 'alice@example.com')
    await userEvent.click(section('Почта').getByRole('button', { name: 'Сохранить' }))
    expect(await section('Почта').findByRole('alert')).toHaveTextContent('Слишком много писем подтверждения — попробуйте через час')

    await userEvent.type(screen.getByRole('textbox', { name: 'Адрес входящего вебхука' }), 'https://evil.example.com/hook')
    await userEvent.click(section('Чат').getByRole('button', { name: 'Сохранить' }))
    expect(await section('Чат').findByRole('alert')).toHaveTextContent('Этот сервис чата не разрешён на сервере CoDraw')
  })

  it('confirms the address with the link of the letter once and takes the token out of the address of the page', async () => {
    const { fetchMock, router } = renderPage(
      {
        [`GET ${settingsUrl}`]: { body: { ...empty, email: { available: true, channel: emailChannel() } } },
        [`POST ${settingsUrl}/email/confirm`]: { status: 204 },
      },
      '?confirm=token-1',
    )

    expect(await screen.findByRole('status')).toHaveTextContent('Адрес подтверждён: уведомления будут приходить на почту')
    expect(requests(fetchMock, 'POST', `${settingsUrl}/email/confirm`).map(bodyOf)).toEqual([{ token: 'token-1' }])
    expect(router.state.location.search).toBe('')
    // The settings come after the confirmation, which changes them, never with it.
    expect(await within(await screen.findByRole('form', { name: 'Почта' })).findByText('Адрес подтверждён')).toBeInTheDocument()
    const calls = fetchMock.mock.calls.map(([input, init]) => `${init?.method ?? 'GET'} ${input.toString()}`)
    expect(calls.indexOf(`POST ${settingsUrl}/email/confirm`)).toBeLessThan(calls.indexOf(`GET ${settingsUrl}`))
  })

  it('says when the link of the letter does not confirm the address', async () => {
    renderPage(
      {
        [`GET ${settingsUrl}`]: { body: empty },
        [`POST ${settingsUrl}/email/confirm`]: { status: 400, body: { reason: 'invalid-token' } },
      },
      '?confirm=old',
    )

    expect(await screen.findByText(/Ссылка не подходит: она устарела, уже использована/)).toBeInTheDocument()
  })

  it('shows a webhook by its hint only, keeps it without a new address, and sends a test message', async () => {
    const withWebhook = { ...empty, webhook: { ...empty.webhook, channel: webhookChannel({ lastDeliveredAt: minutesAgo(5) }) } }
    const { fetchMock } = renderPage({
      [`GET ${settingsUrl}`]: { body: withWebhook },
      [`PUT ${settingsUrl}/webhook`]: { body: webhookChannel({ enabled: false }) },
      [`POST ${settingsUrl}/webhook/test`]: [{ status: 204 }, { status: 502, body: { reason: 'rejected' } }],
    })

    const chat = await screen.findByRole('form', { name: 'Чат' })
    expect(chat).toHaveTextContent('Сейчас: https://hooks.slack.com/…1234')
    expect(chat).toHaveTextContent('Последнее сообщение — 5 минут назад')
    expect(within(chat).getByRole('textbox', { name: 'Адрес входящего вебхука' })).toHaveValue('')

    await userEvent.click(within(chat).getByRole('checkbox', { name: 'Присылать сообщения' }))
    await userEvent.click(within(chat).getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(requests(fetchMock, 'PUT', `${settingsUrl}/webhook`)).toHaveLength(1))
    expect(bodyOf(requests(fetchMock, 'PUT', `${settingsUrl}/webhook`)[0])).toEqual({
      url: null,
      enabled: false,
      events: ['mentions'],
    })

    await userEvent.click(within(screen.getByRole('form', { name: 'Чат' })).getByRole('button', { name: 'Проверить' }))
    expect(await screen.findByText('Пробное сообщение отправлено')).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('form', { name: 'Чат' })).getByRole('button', { name: 'Проверить' }))
    expect(await within(screen.getByRole('form', { name: 'Чат' })).findByRole('alert')).toHaveTextContent(
      'Сервис чата отклонил сообщение — проверьте адрес вебхука',
    )
  })

  it('shows the last failure of a channel in words', async () => {
    renderPage({
      [`GET ${settingsUrl}`]: {
        body: { ...empty, email: { available: true, channel: emailChannel({ lastError: 'unavailable', lastErrorAt: minutesAgo(3) }) } },
      },
    })

    await screen.findByRole('form', { name: 'Почта' })
    expect(section('Почта').getByRole('alert')).toHaveTextContent('Почтовый сервер недоступен — CoDraw повторит попытку (3 минуты назад)')
    expect(section('Почта').getByText('Адрес подтверждён')).toBeInTheDocument()
  })

  it('lists the muted boards and lets their notifications go again', async () => {
    const { fetchMock } = renderPage({
      [`GET ${settingsUrl}`]: [
        {
          body: {
            ...empty,
            mutedBoards: [
              { boardId, boardTitle: 'Схема БД', mutedAt: minutesAgo(1) },
              { boardId: 'gone', boardTitle: null, mutedAt: minutesAgo(2) },
            ],
          },
        },
        { body: { ...empty, mutedBoards: [{ boardId: 'gone', boardTitle: null, mutedAt: minutesAgo(2) }] } },
      ],
      [`DELETE /api/boards/${boardId}/notification-mute`]: { status: 204 },
    })

    const list = await screen.findByRole('list', { name: 'Доски без уведомлений' })
    expect(within(list).getByRole('link', { name: 'Схема БД' })).toHaveAttribute('href', `/boards/${boardId}`)
    expect(within(list).getByText('Доска недоступна')).toBeInTheDocument()

    await userEvent.click(within(list).getByRole('button', { name: 'Присылать снова: Схема БД' }))

    await waitFor(() => expect(screen.queryByRole('link', { name: 'Схема БД' })).not.toBeInTheDocument())
    expect(requests(fetchMock, 'DELETE', `/api/boards/${boardId}/notification-mute`)).toHaveLength(1)
  })
})
