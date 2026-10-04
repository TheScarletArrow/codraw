import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../api/boards.ts'
import { participantColor } from '../board/identity.ts'
import { SHAPE_DRAG_TYPE } from '../diagram/shapes.ts'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { FakeHocuspocusProvider } from '../test/fakeProvider.ts'
import { ALICE, mockFetch, renderRoutes, type MockResponse } from '../test/render.tsx'
import { BoardPage } from './BoardPage.tsx'

vi.mock('@hocuspocus/provider', async () => ({
  HocuspocusProvider: (await import('../test/fakeProvider.ts')).FakeHocuspocusProvider,
}))
// maxGraph needs real SVG layout; the canvas is covered by unit tests of the binding and by e2e tests.
// The stand-in hands a fake editor to the page, like the real canvas does.
const canvas = vi.hoisted(() => ({ editor: null as FakeEditor | null }))
vi.mock('../diagram/DiagramCanvas.tsx', async () => {
  const { useEffect } = await import('react')
  return {
    DiagramCanvas: ({ onEditor }: { onEditor: (editor: FakeEditor | null) => void }) => {
      useEffect(() => {
        onEditor(canvas.editor)
        return () => onEditor(null)
      }, [onEditor])
      return <div data-testid="diagram-canvas" />
    },
  }
})

const boardId = '0199a000-0000-7000-8000-000000000001'
const board: Board = { id: boardId, title: 'Архитектура', createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' }
const routes = [{ path: '/boards/:boardId', element: <BoardPage /> }]

const toRgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

const tokenUrl = `POST /api/boards/${boardId}/collab-token`
const collabToken = (token: string): MockResponse => ({ body: { token, expiresAt: '2026-10-01T10:05:00Z' } })

async function openBoard(responses: Record<string, MockResponse | MockResponse[]> = {}) {
  const fetchMock = mockFetch({
    'GET /api/me': { body: ALICE },
    [`GET /api/boards/${boardId}`]: { body: board },
    [tokenUrl]: [collabToken('token-1'), collabToken('token-2')],
    ...responses,
  })
  const { unmount } = renderRoutes(routes, `/boards/${boardId}`)
  await screen.findByRole('heading', { name: 'Архитектура' })
  return Object.assign(FakeHocuspocusProvider.latest(), { unmount, fetchMock })
}

const requests = (fetchMock: ReturnType<typeof mockFetch>, method: string, url: string) =>
  fetchMock.mock.calls.filter(([input, init]) => (init?.method ?? 'GET') === method && input.toString() === url)

describe('BoardPage', () => {
  beforeEach(() => {
    canvas.editor = createFakeEditor()
    FakeHocuspocusProvider.instances = []
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

  it('shows the canvas once the document is synced', async () => {
    const provider = await openBoard()
    expect(screen.queryByTestId('diagram-canvas')).toBeNull()

    act(() => provider.emitSynced())

    expect(screen.getByTestId('diagram-canvas')).toBeInTheDocument()
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

  it('gets a new collab token for the board before every connection', async () => {
    const provider = await openBoard()

    await expect(provider.requestToken()).resolves.toBe('token-1')
    await expect(provider.requestToken()).resolves.toBe('token-2')

    expect(requests(provider.fetchMock, 'POST', `/api/boards/${boardId}/collab-token`)).toHaveLength(2)
  })

  it('shows "Доска не найдена" and stops connecting when no token is issued for the board', async () => {
    const provider = await openBoard({ [tokenUrl]: { status: 404 } })

    await act(() => expect(provider.requestToken()).rejects.toThrow('404'))

    expect(screen.getByRole('alert')).toHaveTextContent('Доска не найдена')
    expect(provider.disconnected).toBe(true)
  })

  it('checks the session again when the token request gets 401', async () => {
    const provider = await openBoard({ [tokenUrl]: { status: 401 } })

    await act(() => expect(provider.requestToken()).rejects.toThrow('401'))

    await waitFor(() => expect(requests(provider.fetchMock, 'GET', '/api/me')).toHaveLength(2))
  })

  it('shows "Доска не найдена" when the board does not exist', async () => {
    mockFetch({ 'GET /api/me': { body: ALICE }, [`GET /api/boards/${boardId}`]: { status: 404 } })

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

  it('lists the participant itself with the name, the avatar and the color of the profile', async () => {
    const provider = await openBoard()

    const participants = screen.getByRole('list', { name: 'Участники' })
    expect(participants).toHaveTextContent(/^Алиса \(вы\)$/)
    expect(participants.querySelector('img')).toHaveAttribute('src', ALICE.avatarUrl)
    const color = participants.querySelector<HTMLElement>('.participant-color')!.style.backgroundColor
    expect(color).toBe(toRgb(participantColor(ALICE.id)))
    expect(provider.awareness.getStates().get(provider.awareness.clientID)?.user).toEqual({
      name: 'Алиса',
      avatarUrl: ALICE.avatarUrl,
      color: participantColor(ALICE.id),
    })
  })

  it('updates the list when other participants join and leave', async () => {
    const provider = await openBoard()
    const participants = () =>
      within(screen.getByRole('list', { name: 'Участники' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent)

    act(() => provider.awareness.setState(7, { user: { name: 'Боб', color: '#dc2626', avatarUrl: null } }))
    expect(participants()).toHaveLength(2)
    expect(participants()).toContain('Боб')

    act(() => provider.awareness.setState(7, null))
    expect(participants()).toHaveLength(1)
  })

  it('closes the connection when leaving the page', async () => {
    const provider = await openBoard()

    provider.unmount()

    expect(provider.destroyed).toBe(true)
  })

  describe('editor', () => {
    async function openEditor() {
      const provider = await openBoard()
      act(() => provider.emitSynced())
      return canvas.editor!
    }

    it('shows the shape palette, the toolbar and the participants', async () => {
      await openEditor()

      const palette = screen.getByRole('complementary', { name: 'Фигуры' })
      expect(within(palette).getAllByRole('button').map((button) => button.textContent)).toEqual([
        'Прямоугольник',
        'Скруглённый прямоугольник',
        'Эллипс',
        'Ромб',
        'Текст',
      ])
      const toolbar = screen.getByRole('toolbar', { name: 'Инструменты' })
      expect(within(toolbar).getByRole('button', { name: 'Отменить' })).toBeDisabled()
      expect(within(toolbar).getByRole('button', { name: 'Повторить' })).toBeDisabled()
      expect(within(toolbar).getByRole('button', { name: 'Масштаб' })).toHaveTextContent('100%')
      expect(screen.getByRole('list', { name: 'Участники' })).toBeInTheDocument()
    })

    it('disables the palette and the toolbar until the canvas is ready', async () => {
      await openBoard()

      expect(screen.getByRole('button', { name: 'Прямоугольник' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Увеличить' })).toBeDisabled()
    })

    it('adds a shape to the middle of the view on click', async () => {
      const editor = await openEditor()

      await userEvent.click(screen.getByRole('button', { name: 'Эллипс' }))

      expect(editor.addShape).toHaveBeenCalledWith('ellipse')
    })

    it('puts the shape id into the drag data', async () => {
      await openEditor()
      const setData = vi.fn()

      fireEvent.dragStart(screen.getByRole('button', { name: 'Ромб' }), { dataTransfer: { setData } })

      expect(setData).toHaveBeenCalledWith(SHAPE_DRAG_TYPE, 'rhombus')
    })

    it('zooms with the toolbar buttons and shows the scale', async () => {
      const editor = await openEditor()

      await userEvent.click(screen.getByRole('button', { name: 'Увеличить' }))
      await userEvent.click(screen.getByRole('button', { name: 'Уменьшить' }))
      await userEvent.click(screen.getByRole('button', { name: 'Масштаб' }))
      act(() => editor.setState({ scale: 1.5 }))

      expect(editor.zoomIn).toHaveBeenCalled()
      expect(editor.zoomOut).toHaveBeenCalled()
      expect(editor.zoomActual).toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Масштаб' })).toHaveTextContent('150%')
    })

    it('undoes and redoes when the editor allows it', async () => {
      const editor = await openEditor()

      act(() => editor.setState({ canUndo: true, canRedo: true }))
      await userEvent.click(screen.getByRole('button', { name: 'Отменить' }))
      await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))

      expect(editor.undo).toHaveBeenCalled()
      expect(editor.redo).toHaveBeenCalled()
    })
  })
})
