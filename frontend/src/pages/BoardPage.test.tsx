import { act, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../api/boards.ts'
import { PARTICIPANT_COLORS, resetGuestIdentityCache } from '../board/guest.ts'
import { FakeHocuspocusProvider } from '../test/fakeProvider.ts'
import { mockFetch, renderRoutes } from '../test/render.tsx'
import { BoardPage } from './BoardPage.tsx'

vi.mock('@hocuspocus/provider', async () => ({
  HocuspocusProvider: (await import('../test/fakeProvider.ts')).FakeHocuspocusProvider,
}))

const boardId = '0199a000-0000-7000-8000-000000000001'
const board: Board = { id: boardId, title: 'Архитектура', createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' }
const routes = [{ path: '/boards/:boardId', element: <BoardPage /> }]

const toRgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

async function openBoard() {
  mockFetch({ [`GET /api/boards/${boardId}`]: { body: board } })
  const { unmount } = renderRoutes(routes, `/boards/${boardId}`)
  await screen.findByRole('heading', { name: 'Архитектура' })
  return Object.assign(FakeHocuspocusProvider.latest(), { unmount })
}

describe('BoardPage', () => {
  beforeEach(() => {
    FakeHocuspocusProvider.instances = []
    sessionStorage.clear()
    resetGuestIdentityCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('connects to the document of the board', async () => {
    const provider = await openBoard()

    expect(provider.configuration.name).toBe(boardId)
    expect('url' in provider.configuration && provider.configuration.url).toBe(`ws://${location.host}/collab`)
  })

  it('shows "Подключение" until the document is synced', async () => {
    const provider = await openBoard()
    expect(screen.getByRole('status')).toHaveTextContent('Подключение')

    act(() => {
      provider.emitStatus('connected')
      provider.emitSynced()
    })

    expect(screen.getByRole('status')).toHaveTextContent('Синхронизировано')
  })

  it('shows "Нет связи" after losing the connection and recovers after resync', async () => {
    const provider = await openBoard()
    act(() => provider.emitSynced())

    act(() => {
      provider.emitStatus('disconnected')
      provider.emitStatus('connecting')
    })
    expect(screen.getByRole('status')).toHaveTextContent('Нет связи')

    act(() => {
      provider.emitStatus('connected')
      provider.emitSynced()
    })
    expect(screen.getByRole('status')).toHaveTextContent('Синхронизировано')
  })

  it('shows "Доска не найдена" when the board does not exist', async () => {
    mockFetch({ [`GET /api/boards/${boardId}`]: { status: 404 } })

    renderRoutes(routes, `/boards/${boardId}`)

    expect(await screen.findByRole('alert')).toHaveTextContent('Доска не найдена')
    expect(FakeHocuspocusProvider.instances).toEqual([])
  })

  it('shows "Доска не найдена" and stops reconnecting when collab rejects the board', async () => {
    const provider = await openBoard()

    act(() => {
      provider.emitAuthenticationFailed('board-not-found')
      provider.emitStatus('disconnected')
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Доска не найдена')
    expect(provider.disconnected).toBe(true)
  })

  it('lists the participant itself as a guest with a palette color', async () => {
    await openBoard()

    const participants = screen.getByRole('list', { name: 'Участники' })
    expect(participants).toHaveTextContent(/^Гость \d{1,3} \(вы\)$/)
    const color = participants.querySelector<HTMLElement>('.participant-color')!.style.backgroundColor
    expect(PARTICIPANT_COLORS.map(toRgb)).toContain(color)
  })

  it('updates the list when other participants join and leave', async () => {
    const provider = await openBoard()
    const participants = () =>
      within(screen.getByRole('list', { name: 'Участники' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent)

    act(() => provider.awareness.setState(7, { user: { name: 'Гость 42', color: '#dc2626' } }))
    expect(participants()).toHaveLength(2)
    expect(participants()).toContain('Гость 42')

    act(() => provider.awareness.setState(7, null))
    expect(participants()).toHaveLength(1)
  })

  it('closes the connection when leaving the page', async () => {
    const provider = await openBoard()

    provider.unmount()

    expect(provider.destroyed).toBe(true)
  })
})
