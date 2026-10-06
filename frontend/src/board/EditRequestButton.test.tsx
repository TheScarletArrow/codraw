import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccessRequest } from '../api/accessRequests.ts'
import type { Board } from '../api/boards.ts'
import { createQueryClient } from '../queryClient.ts'
import { mockFetch, type MockResponse } from '../test/render.tsx'
import { EditRequestButton } from './EditRequestButton.tsx'

const boardId = '0199a000-0000-7000-8000-000000000001'
const boardUrl = `/api/boards/${boardId}`
const ownUrl = `${boardUrl}/access-request`
/** The board of Алиса whose link gives viewing only, as Боб sees it. */
const boardToView: Board = {
  id: boardId,
  title: 'Архитектура',
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
  linkAccess: 'view',
  owner: { id: 'alice', name: 'Алиса', avatarUrl: null },
  role: 'viewer',
}
const waiting: AccessRequest = {
  id: 'request-1',
  userId: 'bob',
  name: 'Боб',
  avatarUrl: null,
  role: 'editor',
  message: null,
  createdAt: '2026-10-01T10:00:00Z',
}

function renderButton(responses: Record<string, MockResponse | MockResponse[]>) {
  const fetchMock = mockFetch(responses)
  render(
    <QueryClientProvider client={createQueryClient()}>
      <EditRequestButton boardId={boardId} />
    </QueryClientProvider>,
  )
  return fetchMock
}

/** The user comes back to the tab: the page asks again whether the owner answered. */
const returnToTab = () => act(() => window.dispatchEvent(new Event('visibilitychange')))

describe('EditRequestButton', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('asks the owner for editing with a message, then offers to cancel the request', async () => {
    const fetchMock = renderButton({
      [`GET ${ownUrl}`]: { status: 204 },
      [`PUT ${ownUrl}`]: { body: { ...waiting, message: 'Хочу поправить связи' } },
      [`DELETE ${ownUrl}`]: { status: 204 },
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Запросить правку' }))
    const dialog = screen.getByRole('dialog', { name: 'Запрос правки' })
    expect(within(dialog).queryByRole('radio')).toBeNull()
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Сообщение владельцу' }), 'Хочу поправить связи')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Отправить запрос' }))

    expect(await screen.findByRole('button', { name: 'Запрос отправлен' })).toBeInTheDocument()
    const [, init] = fetchMock.mock.calls.find(([input, init]) => init?.method === 'PUT' && input.toString() === ownUrl)!
    expect(JSON.parse(init!.body as string)).toEqual({ role: 'editor', message: 'Хочу поправить связи' })

    await userEvent.click(within(dialog).getByRole('button', { name: 'Отменить запрос' }))

    expect(await screen.findByRole('button', { name: 'Запросить правку' })).toBeInTheDocument()
  })

  it('says that the owner declined when the request is gone and the board still gives viewing only', async () => {
    renderButton({
      [`GET ${ownUrl}`]: [{ body: waiting }, { status: 204 }],
      [`GET ${boardUrl}`]: { body: boardToView },
    })
    await screen.findByRole('button', { name: 'Запрос отправлен' })

    await returnToTab()

    await userEvent.click(await screen.findByRole('button', { name: 'Запрос отклонён' }))
    expect(screen.getByRole('dialog', { name: 'Запрос правки' })).toHaveTextContent(
      'Владелец отклонил запрос. Можно попросить снова.',
    )
    expect(screen.getByRole('button', { name: 'Отправить запрос' })).toBeInTheDocument()
  })

  it('says nothing about an answer that gives editing', async () => {
    const fetchMock = renderButton({
      [`GET ${ownUrl}`]: [{ body: waiting }, { status: 204 }],
      [`GET ${boardUrl}`]: { body: { ...boardToView, role: 'editor' } },
    })
    await screen.findByRole('button', { name: 'Запрос отправлен' })

    await returnToTab()

    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => input.toString() === boardUrl)).toHaveLength(1))
    // The answer of the board settles.
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Запросить правку' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Запрос отклонён' })).toBeNull()
  })
})
