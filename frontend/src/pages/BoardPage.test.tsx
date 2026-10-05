import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../api/boards.ts'
import { participantColor } from '../board/identity.ts'
import { BOARD_CHANGED } from '../board/messages.ts'
import * as Y from 'yjs'
import { DEFAULT_PAGE_ID, getCells, initializeDocument } from '../diagram/model.ts'
import { addPage, listPages, renamePage } from '../diagram/pages.ts'
import { SHAPE_DRAG_TYPE } from '../diagram/shapes.ts'
import { SAMPLE_DRAWIO } from '../drawio/fixtures.ts'
import { setPendingImport } from '../drawio/files.ts'
import { parseDrawio } from '../drawio/parse.ts'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { FakeHocuspocusProvider } from '../test/fakeProvider.ts'
import { ALICE, mockFetch, renderRoutes, type MockResponse } from '../test/render.tsx'
import { BoardPage } from './BoardPage.tsx'

vi.mock('@hocuspocus/provider', async () => ({
  HocuspocusProvider: (await import('../test/fakeProvider.ts')).FakeHocuspocusProvider,
}))
// maxGraph needs real SVG layout; the canvas is covered by unit tests of the binding and by e2e tests.
// The stand-in hands a fake editor to the page, like the real canvas does.
// A canvas of another page gets a new fake editor, which becomes `canvas.editor`.
const canvas = vi.hoisted(() => ({ editor: null as FakeEditor | null }))
vi.mock('../diagram/DiagramCanvas.tsx', async () => {
  const { useEffect } = await import('react')
  const { createFakeEditor } = await import('../test/fakeEditor.ts')
  return {
    DiagramCanvas: ({
      pageId,
      readOnly = false,
      onEditor,
    }: {
      pageId: string
      readOnly?: boolean
      onEditor: (editor: FakeEditor | null) => void
    }) => {
      useEffect(() => {
        if (canvas.editor?.pageId !== pageId || canvas.editor.readOnly !== readOnly) {
          canvas.editor = createFakeEditor({ pageId, readOnly })
        }
        onEditor(canvas.editor)
        return () => onEditor(null)
      }, [pageId, readOnly, onEditor])
      return <div data-testid="diagram-canvas" data-page={pageId} data-read-only={readOnly} />
    },
  }
})

const boardId = '0199a000-0000-7000-8000-000000000001'
const board: Board = {
  id: boardId,
  title: 'Архитектура',
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
  linkAccess: 'edit',
  owner: { id: ALICE.id, name: ALICE.name, avatarUrl: ALICE.avatarUrl },
  role: 'owner',
}
/** The board of Алиса as Боб sees it, having opened it through its link. */
const boardOfAnother: Board = { ...board, role: 'editor' }
/** The board of Алиса whose link gives viewing only, as Боб sees it. */
const boardToView: Board = { ...board, role: 'viewer', linkAccess: 'view' }
const routes = [
  { path: '/', element: <p>Список досок</p> },
  { path: '/boards/:boardId', element: <BoardPage /> },
]
const boardUrl = `/api/boards/${boardId}`

const toRgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

const tokenUrl = `POST /api/boards/${boardId}/collab-token`
const collabToken = (token: string): MockResponse => ({ body: { token, expiresAt: '2026-10-01T10:05:00Z' } })

async function openBoard(responses: Record<string, MockResponse | MockResponse[]> = {}, search = '') {
  const fetchMock = mockFetch({
    'GET /api/me': { body: ALICE },
    [`GET /api/boards/${boardId}`]: { body: board },
    [tokenUrl]: [collabToken('token-1'), collabToken('token-2')],
    ...responses,
  })
  const { unmount, router } = renderRoutes(routes, `/boards/${boardId}${search}`)
  await screen.findByRole('heading', { name: 'Архитектура', level: 2 })
  const provider = FakeHocuspocusProvider.latest()
  const document = (provider.configuration as { document: Y.Doc }).document
  return Object.assign(provider, { unmount, fetchMock, router, document })
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

  describe('access through the link', () => {
    it('shows "Нет доступа" when the owner closed the link of the board', async () => {
      mockFetch({ 'GET /api/me': { body: ALICE }, [`GET /api/boards/${boardId}`]: { status: 403 } })

      renderRoutes(routes, `/boards/${boardId}`)

      expect(await screen.findByRole('alert')).toHaveTextContent('Нет доступа: владелец закрыл доступ к доске по ссылке')
      expect(FakeHocuspocusProvider.instances).toEqual([])
    })

    it('shows "Нет доступа" and stops connecting when no token is issued because the link was closed', async () => {
      const provider = await openBoard({ [tokenUrl]: { status: 403 } })

      await act(() => expect(provider.requestToken()).rejects.toThrow('403'))

      expect(screen.getByRole('alert')).toHaveTextContent('Нет доступа')
      expect(provider.disconnected).toBe(true)
    })

    it('shows a participant who may only view the board without the means to change it', async () => {
      const provider = await openBoard({ [`GET ${boardUrl}`]: { body: boardToView } })
      initializeDocument(provider.document)
      act(() => provider.emitSynced())

      expect(screen.getByText('Только просмотр')).toBeInTheDocument()
      expect(screen.getByTestId('diagram-canvas')).toHaveAttribute('data-read-only', 'true')
      expect(screen.queryByRole('complementary', { name: 'Фигуры' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Отменить' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Добавить страницу' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Импорт из .drawio' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Экспорт в .drawio' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Увеличить' })).toBeEnabled()
    })

    it('does not write to the document of a participant who may only view, even when it is empty', async () => {
      const provider = await openBoard({ [`GET ${boardUrl}`]: { body: boardToView } })
      const updates = vi.fn()
      provider.document.on('update', updates)

      act(() => provider.emitSynced())

      expect(await screen.findByText('Доска пока пуста')).toBeInTheDocument()
      expect(updates).not.toHaveBeenCalled()
    })

    it('takes the new role when collab closes the connection because the access changed, and keeps connecting', async () => {
      const provider = await openBoard({ [`GET ${boardUrl}`]: [{ body: boardOfAnother }, { body: boardToView }] })
      act(() => provider.emitSynced())
      expect(screen.getByTestId('diagram-canvas')).toHaveAttribute('data-read-only', 'false')

      act(() => provider.emitClose('access-changed'))

      expect(await screen.findByText('Только просмотр')).toBeInTheDocument()
      expect(screen.getByTestId('diagram-canvas')).toHaveAttribute('data-read-only', 'true')
      expect(canvas.editor!.readOnly).toBe(true)
      expect(provider.disconnected).toBe(false)
    })

    it('takes the role again on every reconnection, as the access may have changed while it was offline', async () => {
      const provider = await openBoard({ [`GET ${boardUrl}`]: [{ body: boardToView }, { body: boardOfAnother }] })
      initializeDocument(provider.document)
      act(() => {
        provider.emitAuthenticated('readonly')
        provider.emitSynced()
      })
      expect(screen.getByText('Только просмотр')).toBeInTheDocument()
      expect(requests(provider.fetchMock, 'GET', boardUrl)).toHaveLength(1)

      act(() => provider.emitAuthenticated('read-write'))

      await waitFor(() => expect(screen.queryByText('Только просмотр')).toBeNull())
      expect(requests(provider.fetchMock, 'GET', boardUrl)).toHaveLength(2)
    })

    it('edits only over a connection that accepts changes, when the access changed before the page connected', async () => {
      const provider = await openBoard({ [`GET ${boardUrl}`]: [{ body: boardOfAnother }, { body: boardToView }] })
      const updates = vi.fn()
      provider.document.on('update', updates)

      act(() => {
        provider.emitAuthenticated('readonly')
        provider.emitSynced()
      })

      expect(screen.getByText('Только просмотр')).toBeInTheDocument()
      expect(screen.queryByRole('complementary', { name: 'Фигуры' })).toBeNull()
      expect(updates).not.toHaveBeenCalled()
      await waitFor(() => expect(requests(provider.fetchMock, 'GET', boardUrl)).toHaveLength(2))
    })

    it('shows "Нет доступа" when collab rejects a participant whom the board no longer gives access', async () => {
      const provider = await openBoard({ [`GET ${boardUrl}`]: [{ body: boardOfAnother }, { status: 403 }] })

      act(() => provider.emitAuthenticationFailed('no-access'))

      expect(await screen.findByRole('alert')).toHaveTextContent('Нет доступа')
      expect(provider.disconnected).toBe(true)
    })

    it('shows "Нет доступа" when the owner closed the link while the participant works on the board', async () => {
      const provider = await openBoard({ [`GET ${boardUrl}`]: [{ body: boardOfAnother }, { status: 403 }] })
      act(() => provider.emitSynced())

      act(() => provider.emitStateless(BOARD_CHANGED))

      expect(await screen.findByRole('alert')).toHaveTextContent('Нет доступа')
      expect(provider.destroyed).toBe(true)
    })

    it('gives the link to the board on the current page and copies it', async () => {
      const writeText = vi.fn(async () => {})
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
      const provider = await openBoard()
      act(() => provider.emitSynced())

      await userEvent.click(screen.getByRole('button', { name: 'Поделиться' }))
      const link = `${location.origin}/boards/${boardId}?page=${DEFAULT_PAGE_ID}`
      expect(screen.getByRole('textbox', { name: 'Ссылка на доску' })).toHaveValue(link)
      await userEvent.click(screen.getByRole('button', { name: 'Копировать' }))

      expect(writeText).toHaveBeenCalledWith(link)
      expect(screen.getByRole('button', { name: 'Скопировано' })).toBeInTheDocument()
    })

    it('lets the owner change what the link gives and tells the other participants', async () => {
      const provider = await openBoard({ [`PATCH ${boardUrl}`]: { body: { ...board, linkAccess: 'view' } } })
      act(() => provider.emitSynced())

      await userEvent.click(screen.getByRole('button', { name: 'Поделиться' }))
      expect(screen.getByRole('radio', { name: /Редактирование/ })).toBeChecked()
      await userEvent.click(screen.getByRole('radio', { name: /Просмотр/ }))

      await waitFor(() => expect(provider.sentStateless).toEqual([BOARD_CHANGED]))
      const [[, init]] = requests(provider.fetchMock, 'PATCH', boardUrl)
      expect(JSON.parse(init!.body as string)).toEqual({ linkAccess: 'view' })
      expect(screen.getByRole('radio', { name: /Просмотр/ })).toBeChecked()
    })

    it('shows a participant who does not own the board what the link gives, without changing it', async () => {
      const provider = await openBoard({ [`GET ${boardUrl}`]: { body: boardToView } })
      act(() => provider.emitSynced())

      await userEvent.click(screen.getByRole('button', { name: 'Поделиться' }))

      expect(screen.getByText('По ссылке доску можно только смотреть')).toBeInTheDocument()
      expect(screen.queryByRole('radio')).toBeNull()
    })
  })

  describe('versions', () => {
    const versionsUrl = `/api/boards/${boardId}/versions`
    const version = (id: string, reason: 'auto' | 'manual' | 'restore', createdAt = '2026-10-01T09:00:00Z') => ({
      id,
      reason,
      createdAt,
    })

    /** The state of a board with one shape on its first page, as a version keeps it. */
    function versionState() {
      const doc = new Y.Doc()
      initializeDocument(doc)
      getCells(doc).set('kept', new Y.Map(Object.entries({ kind: 'vertex', parent: '1', order: 'a0', value: 'Сервис' })))
      return Y.encodeStateAsUpdate(doc)
    }

    async function openHistory(responses: Record<string, MockResponse | MockResponse[]> = {}) {
      const provider = await openBoard({ [`GET ${versionsUrl}`]: { body: [version('v2', 'manual'), version('v1', 'auto')] }, ...responses })
      act(() => provider.emitSynced())
      await userEvent.click(screen.getByRole('button', { name: 'Меню доски «Архитектура»' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'История версий' }))
      return provider
    }

    it('lists the versions of the board for its owner', async () => {
      await openHistory()

      const history = screen.getByRole('complementary', { name: 'История версий' })
      const items = await within(history).findAllByRole('button', { pressed: false })
      expect(items.map((item) => item.textContent)).toEqual([
        expect.stringContaining('Вручную'),
        expect.stringContaining('Автоматически'),
      ])
    })

    it('saves the current state of the board as a version', async () => {
      const provider = await openHistory({
        [`POST ${versionsUrl}?reason=manual`]: { status: 201, body: version('v3', 'manual') },
      })

      await userEvent.click(screen.getByRole('button', { name: 'Сохранить версию' }))

      await waitFor(() => expect(requests(provider.fetchMock, 'POST', `${versionsUrl}?reason=manual`)).toHaveLength(1))
      const [[, init]] = requests(provider.fetchMock, 'POST', `${versionsUrl}?reason=manual`)
      const saved = new Y.Doc()
      Y.applyUpdate(saved, init!.body as Uint8Array)
      expect(getCells(saved).toJSON()).toEqual(getCells(provider.document).toJSON())
      await waitFor(() => expect(requests(provider.fetchMock, 'GET', versionsUrl)).toHaveLength(2))
    })

    it('shows a selected version in place of the board, for viewing only', async () => {
      await openHistory({ [`GET ${versionsUrl}/v1`]: { bytes: versionState() } })

      await userEvent.click(await screen.findByRole('button', { name: /Автоматически/ }))

      const preview = await screen.findByRole('region', { name: /^Версия от / })
      expect(await within(preview).findByTestId('diagram-canvas')).toHaveAttribute('data-read-only', 'true')
      expect(within(preview).getByRole('tab', { name: 'Страница 1' })).toBeInTheDocument()
      expect(screen.queryByRole('complementary', { name: 'Фигуры' })).toBeNull()

      await userEvent.click(within(preview).getByRole('button', { name: 'Закрыть' }))
      expect(screen.queryByRole('region', { name: /^Версия от / })).toBeNull()
      expect(screen.getByRole('complementary', { name: 'Фигуры' })).toBeInTheDocument()
    })

    it('keeps the current state as a version, then restores the selected one for everybody', async () => {
      const provider = await openHistory({
        [`GET ${versionsUrl}/v1`]: { bytes: versionState() },
        [`POST ${versionsUrl}?reason=restore`]: { status: 201, body: version('v3', 'restore') },
      })
      getCells(provider.document).set('later', new Y.Map(Object.entries({ kind: 'vertex', parent: '1', order: 'a1' })))
      await userEvent.click(await screen.findByRole('button', { name: /Автоматически/ }))
      const preview = await screen.findByRole('region', { name: /^Версия от / })
      await within(preview).findByTestId('diagram-canvas')

      await userEvent.click(within(preview).getByRole('button', { name: 'Восстановить эту версию' }))
      await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Восстановление версии' })).getByRole('button', { name: 'Восстановить' }))

      await waitFor(() => expect(screen.queryByRole('region', { name: /^Версия от / })).toBeNull())
      const [[, init]] = requests(provider.fetchMock, 'POST', `${versionsUrl}?reason=restore`)
      const kept = new Y.Doc()
      Y.applyUpdate(kept, init!.body as Uint8Array)
      expect(getCells(kept).has('later')).toBe(true)
      expect(getCells(provider.document).has('later')).toBe(false)
      expect(getCells(provider.document).get('kept')?.get('value')).toBe('Сервис')
    })

    it('leaves the board as it is when the current state cannot be kept', async () => {
      const provider = await openHistory({
        [`GET ${versionsUrl}/v1`]: { bytes: versionState() },
        [`POST ${versionsUrl}?reason=restore`]: { status: 500 },
      })
      await userEvent.click(await screen.findByRole('button', { name: /Автоматически/ }))
      const preview = await screen.findByRole('region', { name: /^Версия от / })
      await within(preview).findByTestId('diagram-canvas')
      const before = Y.encodeStateVector(provider.document)

      await userEvent.click(within(preview).getByRole('button', { name: 'Восстановить эту версию' }))
      await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Восстановление версии' })).getByRole('button', { name: 'Восстановить' }))

      expect(await within(preview).findByRole('alert')).toHaveTextContent('Не удалось восстановить версию')
      expect(Y.encodeStateVector(provider.document)).toEqual(before)
    })

    it('offers no history to a participant who does not own the board', async () => {
      const provider = await openBoard({ [`GET ${boardUrl}`]: { body: boardOfAnother } })
      act(() => provider.emitSynced())

      expect(screen.queryByRole('button', { name: 'Меню доски «Архитектура»' })).toBeNull()
      expect(screen.queryByRole('complementary', { name: 'История версий' })).toBeNull()
    })
  })

  describe('managing the board', () => {
    it('lets the owner rename the board with a click on its title and tells the other participants', async () => {
      const provider = await openBoard({
        [`PATCH ${boardUrl}`]: { body: { ...board, title: 'Платежи' } },
      })

      await userEvent.click(screen.getByRole('button', { name: 'Архитектура' }))
      const input = screen.getByRole('textbox', { name: 'Название доски' })
      await userEvent.clear(input)
      await userEvent.type(input, 'Платежи{Enter}')

      expect(await screen.findByRole('heading', { name: 'Платежи', level: 2 })).toBeInTheDocument()
      const [[, init]] = requests(provider.fetchMock, 'PATCH', boardUrl)
      expect(JSON.parse(init!.body as string)).toEqual({ title: 'Платежи' })
      expect(provider.sentStateless).toEqual([BOARD_CHANGED])
    })

    it('keeps the title when renaming is cancelled with Escape or the title is left empty', async () => {
      const provider = await openBoard()

      await userEvent.click(screen.getByRole('button', { name: 'Архитектура' }))
      await userEvent.type(screen.getByRole('textbox', { name: 'Название доски' }), 'Другое{Escape}')
      await userEvent.click(screen.getByRole('button', { name: 'Архитектура' }))
      await userEvent.clear(screen.getByRole('textbox', { name: 'Название доски' }))
      await userEvent.keyboard('{Enter}')

      expect(screen.getByRole('heading', { name: 'Архитектура', level: 2 })).toBeInTheDocument()
      expect(requests(provider.fetchMock, 'PATCH', boardUrl)).toHaveLength(0)
      expect(provider.sentStateless).toEqual([])
    })

    it('lets the owner delete the board after confirmation, tells the participants and opens the list', async () => {
      const provider = await openBoard({ [`DELETE ${boardUrl}`]: { status: 204 }, 'GET /api/boards': { body: [] } })

      await userEvent.click(screen.getByRole('button', { name: 'Меню доски «Архитектура»' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Удалить доску' }))
      const confirmation = screen.getByRole('alertdialog', { name: 'Удаление доски' })
      expect(confirmation).toHaveTextContent('Удалить доску «Архитектура»? Её нельзя будет восстановить.')
      await userEvent.click(within(confirmation).getByRole('button', { name: 'Удалить' }))

      await waitFor(() => expect(provider.router.state.location.pathname).toBe('/'))
      expect(requests(provider.fetchMock, 'DELETE', boardUrl)).toHaveLength(1)
      expect(provider.sentStateless).toEqual([BOARD_CHANGED])
      expect(provider.destroyed).toBe(true)
    })

    it('shows a participant who does not own the board its title only', async () => {
      await openBoard({ [`GET ${boardUrl}`]: { body: boardOfAnother } })

      expect(screen.getByRole('heading', { name: 'Архитектура', level: 2 })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Архитектура' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Меню доски «Архитектура»' })).not.toBeInTheDocument()
    })

    it('shows the new title when another participant renamed the board', async () => {
      const provider = await openBoard({
        [`GET ${boardUrl}`]: [{ body: boardOfAnother }, { body: { ...boardOfAnother, title: 'Платежи' } }],
      })

      act(() => provider.emitStateless(BOARD_CHANGED))

      expect(await screen.findByRole('heading', { name: 'Платежи', level: 2 })).toBeInTheDocument()
    })

    it('ignores other stateless messages', async () => {
      const provider = await openBoard({ [`GET ${boardUrl}`]: { body: boardOfAnother } })

      act(() => provider.emitStateless('{"type":"something-else"}'))

      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(requests(provider.fetchMock, 'GET', boardUrl)).toHaveLength(1)
    })

    it('shows "Доска не найдена" when the owner deleted the board on its page', async () => {
      const provider = await openBoard({ [`GET ${boardUrl}`]: [{ body: boardOfAnother }, { status: 404 }] })
      act(() => provider.emitSynced())

      act(() => provider.emitStateless(BOARD_CHANGED))

      expect(await screen.findByRole('alert')).toHaveTextContent('Доска не найдена')
      expect(provider.destroyed).toBe(true)
    })

    it('shows "Доска не найдена" and stops reconnecting when collab closes the connection of a deleted board', async () => {
      const provider = await openBoard()
      act(() => provider.emitSynced())

      act(() => provider.emitClose('board-not-found'))

      expect(screen.getByRole('alert')).toHaveTextContent('Доска не найдена')
      expect(provider.disconnected).toBe(true)
    })
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
      expect(within(palette).getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual([
        'Основные',
        'База данных',
        'Архитектура',
        'Инфраструктура',
        'Данные и сообщения',
        'Клиенты',
        'UML',
        'C4',
      ])
      const basic = within(palette).getByRole('group', { name: 'Основные' })
      expect(within(basic).getAllByRole('button').map((button) => button.textContent)).toEqual([
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

  describe('pages', () => {
    async function openPages(search = '') {
      const provider = await openBoard({}, search)
      act(() => provider.emitSynced())
      return provider
    }
    const tabs = () => within(screen.getByRole('tablist', { name: 'Страницы' })).getAllByRole('tab')
    const currentTab = () => tabs().find((tab) => tab.getAttribute('aria-selected') === 'true')
    const shownPage = () => screen.getByTestId('diagram-canvas').dataset.page

    it('starts with one page and shows it on the canvas', async () => {
      await openPages()

      expect(tabs().map((tab) => tab.textContent)).toEqual(['Страница 1'])
      expect(shownPage()).toBe(DEFAULT_PAGE_ID)
    })

    it('adds a page after the current one, opens it and puts it into the address', async () => {
      const { router, document } = await openPages()

      await userEvent.click(screen.getByRole('button', { name: 'Добавить страницу' }))

      expect(tabs().map((tab) => tab.textContent)).toEqual(['Страница 1', 'Страница 2'])
      const added = listPages(document)[1]!.id
      expect(currentTab()).toHaveTextContent('Страница 2')
      expect(shownPage()).toBe(added)
      expect(router.state.location.search).toBe(`?page=${added}`)
    })

    it('shows pages that other participants add without leaving the current page', async () => {
      const { document } = await openPages()

      act(() => {
        const id = addPage(document, DEFAULT_PAGE_ID)
        renamePage(document, id, 'Контейнеры')
      })

      expect(tabs().map((tab) => tab.textContent)).toEqual(['Страница 1', 'Контейнеры'])
      expect(shownPage()).toBe(DEFAULT_PAGE_ID)
    })

    it('opens the page from the address', async () => {
      const document = new Y.Doc()
      initializeDocument(document)
      const second = addPage(document, DEFAULT_PAGE_ID)
      const provider = await openBoard({}, `?page=${second}`)
      act(() => {
        Y.applyUpdate(provider.document, Y.encodeStateAsUpdate(document))
        provider.emitSynced()
      })

      expect(shownPage()).toBe(second)
      expect(currentTab()).toHaveTextContent('Страница 2')
    })

    it('goes to the first page when another participant deletes the current one', async () => {
      const { document, router } = await openPages()
      await userEvent.click(screen.getByRole('button', { name: 'Добавить страницу' }))
      const added = listPages(document)[1]!.id

      act(() => {
        document.transact(() => document.getMap('pages').delete(added))
      })

      expect(tabs()).toHaveLength(1)
      expect(shownPage()).toBe(DEFAULT_PAGE_ID)
      expect(router.state.location.search).toBe(`?page=${DEFAULT_PAGE_ID}`)
    })

    it('duplicates and deletes pages from the tab menu', async () => {
      const { document } = await openPages()

      await userEvent.click(screen.getByRole('button', { name: 'Меню страницы «Страница 1»' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Дублировать' }))
      expect(tabs().map((tab) => tab.textContent)).toEqual(['Страница 1', 'Страница 1 (копия)'])
      expect(currentTab()).toHaveTextContent('Страница 1 (копия)')

      await userEvent.click(screen.getByRole('button', { name: 'Меню страницы «Страница 1 (копия)»' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Удалить' }))
      await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Удалить' }))
      expect(listPages(document).map((page) => page.name)).toEqual(['Страница 1'])
      expect(getCells(document, DEFAULT_PAGE_ID).size).toBe(2)
    })

    it('names the page of a participant who is on another page and shows them on its tab', async () => {
      const provider = await openPages()
      let second = ''
      act(() => {
        second = addPage(provider.document, DEFAULT_PAGE_ID, 'Контейнеры')
        provider.awareness.setState(7, { user: { name: 'Боб', color: '#dc2626', avatarUrl: null }, page: second })
      })

      const participants = screen.getByRole('list', { name: 'Участники' })
      expect(within(participants).getByRole('button', { name: /Боб/ })).toHaveTextContent('Боб · Контейнеры')
      expect(within(tabs()[1]!).getByTestId('page-visitor')).toBeInTheDocument()
    })

    it('goes to the page of another participant and centres their cursor', async () => {
      const provider = await openPages()
      let second = ''
      act(() => {
        second = addPage(provider.document, DEFAULT_PAGE_ID, 'Контейнеры')
        provider.awareness.setState(7, {
          user: { name: 'Боб', color: '#dc2626', avatarUrl: null },
          page: second,
          cursor: { x: 1500, y: 900 },
        })
      })

      await userEvent.click(within(screen.getByRole('list', { name: 'Участники' })).getByRole('button', { name: /Боб/ }))

      expect(shownPage()).toBe(second)
      await waitFor(() => expect(canvas.editor!.centerOn).toHaveBeenCalledWith({ x: 1500, y: 900 }))
      expect(canvas.editor!.pageId).toBe(second)
    })
  })

  describe('draw.io files', () => {
    async function openSynced() {
      const provider = await openBoard()
      act(() => provider.emitSynced())
      return provider
    }
    const tabNames = () => within(screen.getByRole('tablist', { name: 'Страницы' })).getAllByRole('tab').map((tab) => tab.textContent)

    it('imports the pages of a file into the board and opens the first of them', async () => {
      const provider = await openSynced()
      act(() => {
        provider.document.transact(() =>
          getCells(provider.document).set('own', new Y.Map<unknown>([['kind', 'vertex'] as [string, unknown]])),
        )
      })

      await userEvent.upload(screen.getByLabelText('Файл draw.io'), new File([SAMPLE_DRAWIO], 'Архитектура.drawio'))

      await waitFor(() => expect(tabNames()).toEqual(['Страница 1', 'Контекст', 'Слои']))
      // The tabs follow the document at once; the address, and with it the canvas, switch to the page a moment later.
      await waitFor(() => expect(screen.getByTestId('diagram-canvas').dataset.page).toBe('ctx-page'))
    })

    it('reports a file that is not a draw.io diagram and leaves the board as it is', async () => {
      const provider = await openSynced()

      await userEvent.upload(screen.getByLabelText('Файл draw.io'), new File(['<notes>просто заметки</notes>'], 'notes.xml'))

      expect(await screen.findByRole('alert')).toHaveTextContent('Это не файл draw.io')
      expect(listPages(provider.document)).toHaveLength(1)
    })

    it('exports all pages of the board to a file named after the board', async () => {
      const provider = await openSynced()
      act(() => {
        renamePage(provider.document, DEFAULT_PAGE_ID, 'Контекст')
        addPage(provider.document, DEFAULT_PAGE_ID, 'Контейнеры')
      })
      const blobs: Blob[] = []
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn((blob: Blob) => (blobs.push(blob), 'blob:test')), revokeObjectURL: vi.fn() }))
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe('Архитектура.drawio')
      })

      await userEvent.click(screen.getByRole('button', { name: 'Экспорт в .drawio' }))

      expect(click).toHaveBeenCalled()
      const xml = await blobs[0]!.text()
      expect(Array.from(xml.matchAll(/<diagram [^>]*name="([^"]+)"/g), (match) => match[1])).toEqual(['Контекст', 'Контейнеры'])
      click.mockRestore()
    })

    it('fills a board created from a file once its document is synced', async () => {
      setPendingImport(boardId, await parseDrawio(SAMPLE_DRAWIO))

      await openSynced()

      expect(tabNames()).toEqual(['Контекст', 'Слои'])
      expect(screen.getByTestId('diagram-canvas').dataset.page).toBe('ctx-page')
    })
  })
})
