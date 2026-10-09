import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockFetch, renderRoutes } from '../test/render.tsx'
import { BoardTrash } from './BoardTrash.tsx'

const deleted = { id: 'a', title: 'Схема', deletedAt: '2026-10-08T10:00:00Z', expiresAt: '2026-11-07T10:00:00Z' }
afterEach(() => vi.unstubAllGlobals())

describe('Корзина', () => {
  it('restores and refetches the owner trash', async () => {
    const fetch = mockFetch({ 'GET /api/boards/trash': [{ body: [deleted] }, { body: [] }], 'POST /api/boards/trash/a/restore': { body: {} } })
    renderRoutes([{ path: '/', element: <BoardTrash /> }])
    await userEvent.click(screen.getByRole('button', { name: 'Корзина' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Восстановить' }))
    expect(await screen.findByText('Корзина пуста')).toBeInTheDocument()
    expect(fetch.mock.calls.some(([path, init]) => path === '/api/boards/trash/a/restore' && init?.method === 'POST')).toBe(true)
  })

  it('requires explicit confirmation before permanent deletion', async () => {
    const fetch = mockFetch({ 'GET /api/boards/trash': [{ body: [deleted] }, { body: [] }], 'DELETE /api/boards/trash/a': { status: 204 } })
    renderRoutes([{ path: '/', element: <BoardTrash /> }])
    await userEvent.click(screen.getByRole('button', { name: 'Корзина' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Удалить окончательно' }))
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Удалить навсегда' }))
    await waitFor(() => expect(screen.getByText('Корзина пуста')).toBeInTheDocument())
  })

  it('shows a quota error without removing the recoverable board', async () => {
    mockFetch({ 'GET /api/boards/trash': { body: [deleted] }, 'POST /api/boards/trash/a/restore': { status: 409, body: { limit: 100 } } })
    renderRoutes([{ path: '/', element: <BoardTrash /> }])
    await userEvent.click(screen.getByRole('button', { name: 'Корзина' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Восстановить' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Достигнут лимит 100 досок')
    expect(screen.getByText('Схема')).toBeInTheDocument()
  })
})
