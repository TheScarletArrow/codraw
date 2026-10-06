import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccessRequest } from '../api/accessRequests.ts'
import { createQueryClient } from '../queryClient.ts'
import { mockFetch, type MockResponse } from '../test/render.tsx'
import { NoAccess } from './NoAccess.tsx'

const boardId = '0199a000-0000-7000-8000-000000000001'
const boardUrl = `/api/boards/${boardId}`
const ownUrl = `${boardUrl}/access-request`
const waiting: AccessRequest = {
  id: 'request-1',
  userId: 'bob',
  name: 'Боб',
  avatarUrl: null,
  role: 'editor',
  message: 'Нужно поправить схему',
  createdAt: '2026-10-01T10:00:00Z',
}

function renderNoAccess(responses: Record<string, MockResponse | MockResponse[]>) {
  const fetchMock = mockFetch(responses)
  const queryClient = createQueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <NoAccess boardId={boardId} />
    </QueryClientProvider>,
  )
  return fetchMock
}

const requests = (fetchMock: ReturnType<typeof mockFetch>, method: string, url: string) =>
  fetchMock.mock.calls.filter(([input, init]) => (init?.method ?? 'GET') === method && input.toString() === url)

/** The user comes back to the tab: the page asks again whether the owner answered. */
const returnToTab = () => act(() => window.dispatchEvent(new Event('visibilitychange')))

describe('NoAccess', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('asks the owner for editing with a message and shows the request that waits', async () => {
    const fetchMock = renderNoAccess({
      [`GET ${ownUrl}`]: { status: 204 },
      [`PUT ${ownUrl}`]: { body: waiting },
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Нет доступа: владелец закрыл доступ к доске по ссылке')
    const form = await screen.findByRole('form', { name: 'Запрос доступа' })
    expect(within(form).getByRole('radio', { name: 'Редактирование' })).toBeChecked()

    await userEvent.type(within(form).getByRole('textbox', { name: 'Сообщение владельцу' }), 'Нужно поправить схему')
    await userEvent.click(within(form).getByRole('button', { name: 'Запросить доступ' }))

    expect(await screen.findByRole('heading', { name: 'Запрос отправлен' })).toBeInTheDocument()
    expect(screen.getByText('Нужно поправить схему')).toBeInTheDocument()
    expect(screen.getByText(/Вы попросили «Редактирование»/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Отменить запрос' })).toBeInTheDocument()
    const [[, init]] = requests(fetchMock, 'PUT', ownUrl)
    expect(JSON.parse(init!.body as string)).toEqual({ role: 'editor', message: 'Нужно поправить схему' })
  })

  it('asks for viewing without a message', async () => {
    const fetchMock = renderNoAccess({
      [`GET ${ownUrl}`]: { status: 204 },
      [`PUT ${ownUrl}`]: { body: { ...waiting, role: 'viewer', message: null } },
    })
    const form = await screen.findByRole('form', { name: 'Запрос доступа' })

    await userEvent.click(within(form).getByRole('radio', { name: 'Просмотр' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Запросить доступ' }))

    expect(await screen.findByText(/Вы попросили «Просмотр»/)).toBeInTheDocument()
    const [[, init]] = requests(fetchMock, 'PUT', ownUrl)
    expect(JSON.parse(init!.body as string)).toEqual({ role: 'viewer', message: null })
  })

  it('shows the request that waits when the page opens again, and cancels it', async () => {
    const fetchMock = renderNoAccess({
      [`GET ${ownUrl}`]: { body: waiting },
      [`DELETE ${ownUrl}`]: { status: 204 },
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Отменить запрос' }))

    expect(await screen.findByRole('form', { name: 'Запрос доступа' })).toBeInTheDocument()
    expect(screen.queryByText('Запрос отклонён')).toBeNull()
    expect(requests(fetchMock, 'DELETE', ownUrl)).toHaveLength(1)
  })

  it('says that the request was declined when it is gone and the board still gives no access, and lets ask again', async () => {
    renderNoAccess({
      [`GET ${ownUrl}`]: [{ body: waiting }, { status: 204 }],
      [`GET ${boardUrl}`]: { status: 403 },
      [`PUT ${ownUrl}`]: { body: { ...waiting, id: 'request-2' } },
    })
    await screen.findByRole('heading', { name: 'Запрос отправлен' })

    await returnToTab()

    expect(await screen.findByRole('heading', { name: 'Запрос отклонён' })).toBeInTheDocument()
    expect(screen.getByText('Владелец не дал доступ. Можно попросить снова.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Запросить доступ' }))
    expect(await screen.findByRole('heading', { name: 'Запрос отправлен' })).toBeInTheDocument()
  })

  it('asks for the request again from time to time while it waits', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const fetchMock = renderNoAccess({ [`GET ${ownUrl}`]: { body: waiting } })
      await screen.findByRole('heading', { name: 'Запрос отправлен' })
      expect(requests(fetchMock, 'GET', ownUrl)).toHaveLength(1)

      await act(() => vi.advanceTimersByTimeAsync(10_000))

      await waitFor(() => expect(requests(fetchMock, 'GET', ownUrl)).toHaveLength(2))
    } finally {
      vi.useRealTimers()
    }
  })

  it('says that the board has as many requests as allowed', async () => {
    renderNoAccess({
      [`GET ${ownUrl}`]: { status: 204 },
      [`PUT ${ownUrl}`]: { status: 409, body: { title: 'Access request limit reached', limit: 50 } },
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Запросить доступ' }))

    expect(await screen.findByText('У доски уже 50 запросов доступа — попробуйте позже')).toHaveAttribute('role', 'alert')
  })
})
