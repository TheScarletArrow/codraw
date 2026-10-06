import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../api/boards.ts'
import { participantColor } from '../board/identity.ts'
import type { CommentThread } from '../api/comments.ts'
import { ACCESS_POLL_INTERVAL } from '../board/accessRequests.ts'
import { BOARD_CHANGED, COMMENTS_CHANGED } from '../board/messages.ts'
import * as Y from 'yjs'
import { readAttribution } from '../diagram/attribution.ts'
import {
  DEFAULT_PAGE_ID,
  getCells,
  initializeDocument,
  LAYER_CELL_ID,
  writeCell,
  writePage,
  type CellData,
} from '../diagram/model.ts'
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
// A canvas of another page gets a new fake editor, which becomes `canvas.editor`; `canvas.document` is the document the
// canvas shows.
const canvas = vi.hoisted(() => ({ editor: null as FakeEditor | null, document: null as Y.Doc | null }))
vi.mock('../diagram/DiagramCanvas.tsx', async () => {
  const { useEffect } = await import('react')
  const { createFakeEditor } = await import('../test/fakeEditor.ts')
  return {
    DiagramCanvas: ({
      document,
      pageId,
      readOnly = false,
      participantName,
      participantId,
      onEditor,
    }: {
      document: Y.Doc
      pageId: string
      readOnly?: boolean
      participantName?: string
      participantId?: string
      onEditor: (editor: FakeEditor | null) => void
    }) => {
      useEffect(() => {
        const otherDocument = canvas.document !== null && canvas.document !== document
        if (canvas.editor?.pageId !== pageId || canvas.editor.readOnly !== readOnly || otherDocument) {
          canvas.editor = createFakeEditor({ pageId, readOnly })
        }
        canvas.document = document
        onEditor(canvas.editor)
        return () => onEditor(null)
      }, [document, pageId, readOnly, onEditor])
      return (
        <div
          data-testid="diagram-canvas"
          data-page={pageId}
          data-read-only={readOnly}
          data-participant={participantName}
          data-participant-id={participantId}
        />
      )
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

/** What the API answers the page of the board by default. */
const apiResponses = (responses: Record<string, MockResponse | MockResponse[]> = {}) => ({
  'GET /api/me': { body: ALICE },
  [`GET /api/boards/${boardId}`]: { body: board },
  [tokenUrl]: [collabToken('token-1'), collabToken('token-2')],
  [`GET ${boardUrl}/threads`]: { body: [] },
  [`GET ${boardUrl}/people`]: { body: [{ id: ALICE.id, name: ALICE.name, avatarUrl: null }] },
  [`GET ${boardUrl}/embed`]: { status: 404 },
  [`GET ${boardUrl}/members`]: { body: [{ id: ALICE.id, name: ALICE.name, avatarUrl: null, role: 'owner' }] },
  [`GET ${boardUrl}/visitors`]: { body: [] },
  [`GET ${boardUrl}/invites`]: { body: [] },
  [`GET ${boardUrl}/access-requests`]: { body: [] },
  [`GET ${boardUrl}/access-request`]: { status: 204 },
  [`POST ${boardUrl}/visit`]: { body: { since: null, authors: [], baseline: null } },
  [`PUT ${boardUrl}/visit`]: { status: 204 },
  [`DELETE ${boardUrl}/visit`]: { status: 204 },
  ...responses,
})

async function openBoard(responses: Record<string, MockResponse | MockResponse[]> = {}, search = '') {
  const fetchMock = mockFetch(apiResponses(responses))
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
    canvas.document = null
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

  it('gives the canvas the name of the participant for the locks, and shows the locks of the selection', async () => {
    const provider = await openBoard()
    act(() => provider.emitSynced())
    const editor = canvas.editor!
    editor.placeCell('api', { x: 100, y: 50, width: 120, height: 60 })

    act(() => editor.setState({ lock: { all: true, canLock: false, locks: [{ cellId: 'api', lockedBy: 'Боб' }] } }))

    expect(screen.getByTestId('diagram-canvas')).toHaveAttribute('data-participant', ALICE.name)
    expect(screen.getByRole('img', { name: 'Закреплено: Боб' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Открепить' })).toBeEnabled()
  })

  it('gives the canvas the participant whom their changes name, and shows who changed the selected element', async () => {
    const provider = await openBoard()
    act(() => provider.emitSynced())
    const editor = canvas.editor!

    act(() => editor.setState({ attribution: { by: 'bob', name: 'Боб', at: Date.now(), mine: false } }))

    expect(screen.getByTestId('diagram-canvas')).toHaveAttribute('data-participant-id', ALICE.id)
    expect(screen.getByTestId('diagram-canvas')).toHaveAttribute('data-participant', ALICE.name)
    expect(screen.getByTestId('last-change')).toHaveTextContent('Изменено: Боб, только что')
    expect(screen.getByRole('tablist', { name: 'Страницы' }).parentElement).toContainElement(
      screen.getByTestId('last-change'),
    )
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

  describe('size of the board', () => {
    it.each([
      ['collab refuses a change that would make the board too large', 'document-too-large', 1000],
      ['the socket refuses a message larger than it takes', '', 1009],
    ])('drops the local document and connects again when %s', async (_, reason, code) => {
      const provider = await openBoard()
      act(() => provider.emitSynced())
      provider.document.getMap('meta').set('title', 'Не дойдёт')

      act(() => provider.emitClose(reason, code))

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Доска достигла предельного размера, последнее изменение не сохранено. Удалите лишнее, чтобы продолжить',
      )
      const next = FakeHocuspocusProvider.latest()
      expect(next).not.toBe(provider)
      expect(provider.destroyed).toBe(true)
      const fresh = (next.configuration as { document: Y.Doc }).document
      expect(fresh.getMap('meta').get('title')).toBeUndefined()
      expect(screen.getByRole('status')).toHaveTextContent('Подключение')

      act(() => next.emitSynced())
      expect(screen.getByTestId('diagram-canvas')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Понятно' }))
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })

  describe('access through the link', () => {
    it('shows "Нет доступа" when the owner closed the link of the board, at once and with a request for access', async () => {
      const fetchMock = mockFetch(apiResponses({ [`GET ${boardUrl}`]: { status: 403 } }))

      renderRoutes(routes, `/boards/${boardId}`)

      expect(await screen.findByRole('alert')).toHaveTextContent('Нет доступа: владелец закрыл доступ к доске по ссылке')
      expect(await screen.findByRole('form', { name: 'Запрос доступа' })).toBeInTheDocument()
      expect(FakeHocuspocusProvider.instances).toEqual([])
      // Access does not come with a retry: the page asks again from time to time instead.
      expect(requests(fetchMock, 'GET', boardUrl)).toHaveLength(1)
    })

    it('opens the board once the owner gives access, asking again when the user returns to the tab', async () => {
      mockFetch(apiResponses({ [`GET ${boardUrl}`]: [{ status: 403 }, { body: boardOfAnother }] }))
      renderRoutes(routes, `/boards/${boardId}`)
      await screen.findByRole('form', { name: 'Запрос доступа' })

      act(() => window.dispatchEvent(new Event('visibilitychange')))

      expect(await screen.findByRole('heading', { name: 'Архитектура', level: 2 })).toBeInTheDocument()
      expect(FakeHocuspocusProvider.instances).toHaveLength(1)
    })

    it('asks for the board without access again from time to time', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        const fetchMock = mockFetch(apiResponses({ [`GET ${boardUrl}`]: { status: 403 } }))
        renderRoutes(routes, `/boards/${boardId}`)
        await screen.findByRole('form', { name: 'Запрос доступа' })

        await act(() => vi.advanceTimersByTimeAsync(ACCESS_POLL_INTERVAL))

        await waitFor(() => expect(requests(fetchMock, 'GET', boardUrl)).toHaveLength(2))
      } finally {
        vi.useRealTimers()
      }
    })

    it('opens the board when the user asks for what its link gives already', async () => {
      mockFetch(
        apiResponses({
          [`GET ${boardUrl}`]: [{ status: 403 }, { body: boardToView }],
          [`PUT ${boardUrl}/access-request`]: { status: 409, body: { title: 'Access already given', role: 'viewer' } },
        }),
      )
      renderRoutes(routes, `/boards/${boardId}`)

      await userEvent.click(await screen.findByRole('button', { name: 'Запросить доступ' }))

      expect(await screen.findByRole('heading', { name: 'Архитектура', level: 2 })).toBeInTheDocument()
      expect(screen.getByText('Только просмотр')).toBeInTheDocument()
    })

    it('offers a participant who may only view the board to ask for editing, and nobody else', async () => {
      const provider = await openBoard({ [`GET ${boardUrl}`]: { body: boardToView } })
      act(() => provider.emitSynced())

      expect(await screen.findByRole('button', { name: 'Запросить правку' })).toBeInTheDocument()
      provider.unmount()

      const ownersProvider = await openBoard()
      act(() => ownersProvider.emitSynced())
      expect(screen.queryByRole('button', { name: 'Запросить правку' })).toBeNull()
      expect(requests(ownersProvider.fetchMock, 'GET', `${boardUrl}/access-request`)).toHaveLength(0)
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

    it('opens «Поделиться» on the requests for access from a link, fetching them again, and takes the link out of the address', async () => {
      const request = {
        id: 'request-1',
        userId: 'egor',
        name: 'Егор',
        avatarUrl: null,
        role: 'editor',
        message: 'Нужно поправить схему',
        createdAt: '2026-10-01T10:00:00Z',
      }
      const provider = await openBoard({ [`GET ${boardUrl}/access-requests`]: [{ body: [] }, { body: [request] }] })
      await waitFor(() => expect(requests(provider.fetchMock, 'GET', `${boardUrl}/access-requests`)).toHaveLength(1))
      expect(screen.queryByRole('dialog', { name: 'Поделиться доской' })).toBeNull()

      // The owner, on the board already, opens a notification of a request for access.
      await act(() => provider.router.navigate(`/boards/${boardId}?share=requests`))

      const dialog = await screen.findByRole('dialog', { name: 'Поделиться доской' })
      expect(await within(dialog).findByRole('listitem', { name: 'Егор' })).toHaveTextContent('Нужно поправить схему')
      expect(provider.router.state.location.search).toBe('')
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
      name: null,
      authors: [],
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

    /** A version with «Сервис» and «Кэш» on the first page and a second page «Черновик» with «Набросок». */
    function comparedState() {
      const doc = new Y.Doc()
      initializeDocument(doc)
      doc.transact(() => {
        writeCell(getCells(doc), shape('kept', 'a0', 'Сервис', { x: 100, y: 100 }))
        writeCell(getCells(doc), shape('cache', 'a1', 'Кэш', { x: 400, y: 300 }))
        writePage(doc, 'draft', { name: 'Черновик', order: 'a1' })
        writeCell(getCells(doc, 'draft'), shape('sketch', 'a0', 'Набросок', { x: 0, y: 0 }))
      })
      return Y.encodeStateAsUpdate(doc)
    }

    const shape = (id: string, order: string, value: string, { x, y }: { x: number; y: number }): CellData => ({
      id,
      kind: 'vertex',
      parent: '1',
      order,
      value,
      geometry: { x, y, width: 120, height: 60 },
      source: null,
      target: null,
      style: {},
    })

    describe('comparing a version with the board', () => {
      /** The owner opens the version and turns comparing on; the board has «Сервис» renamed, «Кэш» removed, «Очередь» added. */
      async function openComparison(responses: Record<string, MockResponse | MockResponse[]> = {}) {
        const provider = await openHistory({ [`GET ${versionsUrl}/v1`]: { bytes: comparedState() }, ...responses })
        provider.document.transact(() => {
          writeCell(getCells(provider.document), shape('kept', 'a0', 'Шлюз', { x: 100, y: 100 }))
          writeCell(getCells(provider.document), shape('queue', 'a2', 'Очередь', { x: 600, y: 100 }))
          writePage(provider.document, 'page-2', { name: 'Страница 2', order: 'a2' })
        })
        await userEvent.click(await screen.findByRole('button', { name: /Автоматически/ }))
        const preview = await screen.findByRole('region', { name: /^Версия от / })
        await within(preview).findByTestId('diagram-canvas')
        await userEvent.click(within(preview).getByRole('button', { name: 'Сравнить с текущей' }))
        return { provider, preview }
      }

      it('shows the board now on the canvas, for viewing only, with the changes since the version over it and in a list', async () => {
        const { provider, preview } = await openComparison()

        expect(within(preview).getByRole('button', { name: 'Сравнить с текущей' })).toHaveAttribute('aria-pressed', 'true')
        const list = await within(preview).findByRole('complementary', { name: 'Изменения' })
        expect(within(list).getByText('Добавлено 1 · Изменено 1 · Удалено 2')).toBeInTheDocument()
        const items = within(list).getAllByRole('button', { pressed: false })
        expect(items.map((item) => item.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
          'Добавлено: Очередь Прямоугольник',
          'Изменено: Шлюз Прямоугольник · подпись было «Сервис»',
          'Удалено: Кэш Прямоугольник',
          'Удалено: Набросок Прямоугольник',
        ])
        expect(canvas.document).toBe(provider.document)
        expect(within(preview).getByTestId('diagram-canvas')).toHaveAttribute('data-read-only', 'true')
        // The board has the second page since the version, and the version had «Черновик», which the board has not.
        expect(within(preview).getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'))).toEqual([
          'Страница 1',
          'Страница 2',
          'Черновик',
        ])
        expect(within(preview).getByRole('tab', { name: 'Страница 2' })).toHaveAccessibleDescription('Страница добавлена')
        expect(within(preview).getByRole('tab', { name: 'Черновик' })).toHaveAccessibleDescription('Страница удалена')
        expect(within(preview).getByRole('tab', { name: 'Страница 1' })).toHaveAccessibleDescription('Страница изменена')

        // Over the canvas: the frames of the shapes the canvas shows, and the ghost of the removed one.
        act(() => {
          canvas.editor!.placeCell('kept', { x: 100, y: 100, width: 120, height: 60 })
          canvas.editor!.placeCell('queue', { x: 600, y: 100, width: 120, height: 60 })
        })
        const marks = within(preview).getAllByTestId('change-mark')
        expect(marks.map((mark) => [mark.dataset.cell, mark.dataset.change])).toEqual([
          ['queue', 'added'],
          ['kept', 'changed'],
          ['cache', 'removed'],
        ])
      })

      it('shows who changed the selected element, as the board does', async () => {
        const { preview } = await openComparison()
        await within(preview).findByRole('complementary', { name: 'Изменения' })

        act(() => canvas.editor!.setState({ attribution: { by: 'bob', name: 'Боб', at: Date.now(), mine: false } }))

        expect(within(preview).getByTestId('diagram-canvas')).toHaveAttribute('data-participant-id', ALICE.id)
        expect(within(preview).getByTestId('last-change')).toHaveTextContent('Изменено: Боб, только что')
      })

      it('changes nothing in the board', async () => {
        const { provider } = await openComparison()
        const before = Y.encodeStateVector(provider.document)

        await screen.findByRole('complementary', { name: 'Изменения' })
        await userEvent.click(screen.getByRole('button', { name: /Изменено: Шлюз/ }))
        await userEvent.click(screen.getByRole('tab', { name: 'Черновик' }))

        expect(Y.encodeStateVector(provider.document)).toEqual(before)
      })

      it('shows a changed element on the canvas, and centres the canvas on the ghost of a removed one', async () => {
        await openComparison()
        const list = await screen.findByRole('complementary', { name: 'Изменения' })
        const editor = canvas.editor!

        await userEvent.click(within(list).getByRole('button', { name: /Изменено: Шлюз/ }))
        expect(editor.revealCell).toHaveBeenLastCalledWith('kept')
        expect(within(list).getByRole('button', { name: /Изменено: Шлюз/ })).toHaveAttribute('aria-pressed', 'true')

        await userEvent.click(within(list).getByRole('button', { name: /Удалено: Кэш/ }))
        expect(editor.clearSelection).toHaveBeenCalled()
        expect(editor.centerOn).toHaveBeenLastCalledWith({ x: 460, y: 330 })
      })

      it('goes to a page removed since the version, which shows as the version has it, and shows its element', async () => {
        const { provider } = await openComparison()
        const list = await screen.findByRole('complementary', { name: 'Изменения' })

        await userEvent.click(within(list).getByRole('button', { name: /Удалено: Набросок/ }))

        await waitFor(() => expect(screen.getByTestId('diagram-canvas')).toHaveAttribute('data-page', 'draft'))
        expect(canvas.document).not.toBe(provider.document)
        expect(screen.getByRole('tab', { name: 'Черновик' })).toHaveAttribute('aria-selected', 'true')
        await waitFor(() => expect(canvas.editor!.revealCell).toHaveBeenCalledWith('sketch'))
      })

      it('follows the changes other participants make meanwhile', async () => {
        const { provider } = await openComparison()
        const list = await screen.findByRole('complementary', { name: 'Изменения' })

        act(() => writeCell(getCells(provider.document), shape('more', 'a3', 'Ещё', { x: 0, y: 400 })))

        expect(await within(list).findByText('Добавлено 2 · Изменено 1 · Удалено 2')).toBeInTheDocument()
      })

      it('shows the version again when turned off', async () => {
        const { provider, preview } = await openComparison()
        await screen.findByRole('complementary', { name: 'Изменения' })

        await userEvent.click(within(preview).getByRole('button', { name: 'Сравнить с текущей' }))

        expect(within(preview).getByRole('button', { name: 'Сравнить с текущей' })).toHaveAttribute('aria-pressed', 'false')
        expect(screen.queryByRole('complementary', { name: 'Изменения' })).toBeNull()
        expect(screen.queryAllByTestId('change-mark')).toEqual([])
        expect(canvas.document).not.toBe(provider.document)
        expect(within(preview).getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'))).toEqual(['Страница 1', 'Черновик'])
      })

      it('stays on for another version', async () => {
        await openComparison({ [`GET ${versionsUrl}/v2`]: { bytes: comparedState() } })
        const history = screen.getByRole('complementary', { name: 'История версий' })

        await userEvent.click(within(history).getByRole('button', { name: /Вручную/ }))

        const other = await screen.findByRole('region', { name: /^Версия от / })
        expect(within(other).getByRole('button', { name: 'Сравнить с текущей' })).toHaveAttribute('aria-pressed', 'true')
        expect(await within(other).findByRole('complementary', { name: 'Изменения' })).toBeInTheDocument()
      })

      it('brings back a removed or changed element of a page the board has, and offers nothing for the others', async () => {
        const { provider } = await openComparison()
        const list = await screen.findByRole('complementary', { name: 'Изменения' })
        expect(within(list).getAllByRole('button', { name: /^Вернуть/ }).map((button) => button.getAttribute('aria-label'))).toEqual([
          'Вернуть «Шлюз»',
          'Вернуть «Кэш»',
        ])

        await userEvent.click(within(list).getByRole('button', { name: 'Вернуть «Кэш»' }))

        await waitFor(() => expect(screen.queryByRole('region', { name: /^Версия от / })).toBeNull())
        const board = screen.getByTestId('diagram-canvas')
        expect(board).toHaveAttribute('data-read-only', 'false')
        expect(canvas.document).toBe(provider.document)
        expect(canvas.editor!.restoreCells).toHaveBeenCalledTimes(1)
        const [cells, ids] = vi.mocked(canvas.editor!.restoreCells).mock.calls[0]!
        expect(ids).toEqual(['cache'])
        expect(cells.get('cache')).toMatchObject({ value: 'Кэш', geometry: { x: 400, y: 300 } })
        // A restore of cells is an ordinary change, without a version before it.
        expect(requests(provider.fetchMock, 'POST', `${versionsUrl}?reason=restore`)).toEqual([])
        // Comparing stays on while the history is open.
        await userEvent.click(within(screen.getByRole('complementary', { name: 'История версий' })).getByRole('button', { name: /Автоматически/ }))
        const again = await screen.findByRole('region', { name: /^Версия от / })
        expect(within(again).getByRole('button', { name: 'Сравнить с текущей' })).toHaveAttribute('aria-pressed', 'true')
      })

      it('turns off when the history closes', async () => {
        await openComparison()

        await userEvent.click(screen.getByRole('button', { name: 'Закрыть историю' }))
        await userEvent.click(screen.getByRole('button', { name: 'Меню доски «Архитектура»' }))
        await userEvent.click(screen.getByRole('menuitem', { name: 'История версий' }))
        const history = screen.getByRole('complementary', { name: 'История версий' })
        await userEvent.click(await within(history).findByRole('button', { name: /Автоматически/ }))

        const again = await screen.findByRole('region', { name: /^Версия от / })
        expect(within(again).getByRole('button', { name: 'Сравнить с текущей' })).toHaveAttribute('aria-pressed', 'false')
      })
    })

    describe('restoring part of a version', () => {
      /** The owner opens the version of {@link comparedState}; the board has lost «Кэш» and the page «Черновик». */
      async function openVersion(responses: Record<string, MockResponse | MockResponse[]> = {}) {
        const provider = await openHistory({
          [`GET ${versionsUrl}/v1`]: { bytes: comparedState() },
          [`POST ${versionsUrl}?reason=restore`]: { status: 201, body: version('v3', 'restore') },
          ...responses,
        })
        act(() => writeCell(getCells(provider.document), shape('kept', 'a0', 'Шлюз', { x: 100, y: 100 })))
        await userEvent.click(await screen.findByRole('button', { name: /Автоматически/ }))
        const preview = await screen.findByRole('region', { name: /^Версия от / })
        await within(preview).findByTestId('diagram-canvas')
        return { provider, preview }
      }

      it('restores the cells selected in the version on the canvas of their page, as a change of the user', async () => {
        const { provider, preview } = await openVersion()
        expect(within(preview).queryByRole('button', { name: 'Восстановить выделенное' })).toBeNull()

        act(() => canvas.editor!.select(['cache']))
        await userEvent.click(within(preview).getByRole('button', { name: 'Восстановить выделенное' }))

        await waitFor(() => expect(screen.queryByRole('region', { name: /^Версия от / })).toBeNull())
        expect(screen.getByTestId('diagram-canvas')).toHaveAttribute('data-page', DEFAULT_PAGE_ID)
        expect(canvas.document).toBe(provider.document)
        expect(canvas.editor!.restoreCells).toHaveBeenCalledTimes(1)
        const [cells, ids] = vi.mocked(canvas.editor!.restoreCells).mock.calls[0]!
        expect(ids).toEqual(['cache'])
        expect([...cells.keys()].sort()).toEqual(['cache', 'kept'])
        expect(cells.get('kept')).toMatchObject({ value: 'Сервис' })
        expect(requests(provider.fetchMock, 'POST', `${versionsUrl}?reason=restore`)).toEqual([])
        expect(screen.getByRole('complementary', { name: 'История версий' })).toBeInTheDocument()
      })

      it('offers no restore of the selection on a page the board has not, and brings the page back after confirmation', async () => {
        const { provider, preview } = await openVersion()
        await userEvent.click(within(preview).getByRole('tab', { name: 'Черновик' }))
        await waitFor(() => expect(within(preview).getByTestId('diagram-canvas')).toHaveAttribute('data-page', 'draft'))

        act(() => canvas.editor!.select(['sketch']))
        expect(within(preview).getByRole('button', { name: 'Восстановить выделенное' })).toBeDisabled()
        expect(within(preview).getByRole('button', { name: 'Восстановить выделенное' })).toHaveAccessibleDescription('Страницы нет на доске')
        await userEvent.click(within(preview).getByRole('button', { name: 'Восстановить страницу' }))
        const confirmation = screen.getByRole('alertdialog', { name: 'Восстановление страницы' })
        expect(confirmation).toHaveTextContent('Страница «Черновик» вернётся на доску')
        await userEvent.click(within(confirmation).getByRole('button', { name: 'Восстановить' }))

        await waitFor(() => expect(screen.queryByRole('region', { name: /^Версия от / })).toBeNull())
        expect(requests(provider.fetchMock, 'POST', `${versionsUrl}?reason=restore`)).toHaveLength(1)
        expect(listPages(provider.document).map((page) => page.name)).toEqual(['Страница 1', 'Черновик'])
        expect(getCells(provider.document, 'draft').get('sketch')?.get('value')).toBe('Набросок')
        // The rest of the board stays as it is.
        expect(getCells(provider.document).get('kept')?.get('value')).toBe('Шлюз')
        expect(getCells(provider.document).has('cache')).toBe(false)
        await waitFor(() => expect(screen.getByTestId('diagram-canvas')).toHaveAttribute('data-page', 'draft'))
      })

      it('brings a page of the board to the content of the version, keeping the current state as a version first', async () => {
        const { provider, preview } = await openVersion()

        await userEvent.click(within(preview).getByRole('button', { name: 'Восстановить страницу' }))
        const confirmation = screen.getByRole('alertdialog', { name: 'Восстановление страницы' })
        expect(confirmation).toHaveTextContent('Страница «Страница 1» станет такой, как в версии')
        await userEvent.click(within(confirmation).getByRole('button', { name: 'Восстановить' }))

        await waitFor(() => expect(screen.queryByRole('region', { name: /^Версия от / })).toBeNull())
        const [[, init]] = requests(provider.fetchMock, 'POST', `${versionsUrl}?reason=restore`)
        const kept = new Y.Doc()
        Y.applyUpdate(kept, init!.body as Uint8Array)
        expect(getCells(kept).get('kept')?.get('value')).toBe('Шлюз')
        expect(getCells(provider.document).get('kept')?.get('value')).toBe('Сервис')
        expect(getCells(provider.document).get('cache')?.get('value')).toBe('Кэш')
        expect(listPages(provider.document).map((page) => page.name)).toEqual(['Страница 1'])
      })

      it('leaves the page as it is when the current state cannot be kept', async () => {
        const { provider, preview } = await openVersion({ [`POST ${versionsUrl}?reason=restore`]: { status: 500 } })
        const before = Y.encodeStateVector(provider.document)

        await userEvent.click(within(preview).getByRole('button', { name: 'Восстановить страницу' }))
        await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Восстановление страницы' })).getByRole('button', { name: 'Восстановить' }))

        expect(await within(preview).findByRole('alert')).toHaveTextContent('Не удалось восстановить страницу')
        expect(Y.encodeStateVector(provider.document)).toEqual(before)
      })
    })

    it('offers the history to an editor who does not own the board, in a menu without renaming and deleting', async () => {
      const provider = await openBoard({
        [`GET ${boardUrl}`]: { body: boardOfAnother },
        [`GET ${versionsUrl}`]: { body: [version('v1', 'auto')] },
      })
      act(() => provider.emitSynced())

      await userEvent.click(screen.getByRole('button', { name: 'Меню доски «Архитектура»' }))
      const menu = screen.getByRole('menu', { name: 'Доска «Архитектура»' })
      expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['История версий'])
      await userEvent.click(within(menu).getByRole('menuitem', { name: 'История версий' }))

      const history = screen.getByRole('complementary', { name: 'История версий' })
      expect(await within(history).findByRole('button', { name: /Автоматически/ })).toBeInTheDocument()
    })

    it('offers no history to a participant who may only view the board, and closes it when an editor becomes one', async () => {
      const provider = await openBoard({
        [`GET ${boardUrl}`]: [{ body: boardOfAnother }, { body: boardToView }],
        [`GET ${versionsUrl}`]: { body: [] },
      })
      act(() => provider.emitSynced())
      await userEvent.click(screen.getByRole('button', { name: 'Меню доски «Архитектура»' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'История версий' }))
      expect(screen.getByRole('complementary', { name: 'История версий' })).toBeInTheDocument()

      act(() => provider.emitStateless(BOARD_CHANGED))

      await waitFor(() => expect(screen.queryByRole('complementary', { name: 'История версий' })).toBeNull())
      expect(screen.queryByRole('button', { name: 'Меню доски «Архитектура»' })).toBeNull()
    })
  })

  describe('changes since the last visit', () => {
    const visitUrl = `${boardUrl}/visit`
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const changes = {
      since,
      authors: [{ id: 'bob', name: 'Боб', avatarUrl: null }],
      baseline: { id: 'v1', createdAt: since },
    }
    const banner = () => screen.queryByRole('region', { name: 'С прошлого визита' })

    const shape = (id: string, order: string, value: string): CellData => ({
      id,
      kind: 'vertex',
      parent: '1',
      order,
      value,
      geometry: { x: 0, y: 0, width: 120, height: 60 },
      source: null,
      target: null,
      style: {},
    })

    /** The board as the user left it: «Сервис» on its first page. */
    function baselineState() {
      const doc = new Y.Doc()
      initializeDocument(doc)
      writeCell(getCells(doc), shape('kept', 'a0', 'Сервис'))
      return Y.encodeStateAsUpdate(doc)
    }

    /** Opens the board that Боб changed since the last visit of the user: he added «Очередь». */
    async function openChanged(responses: Record<string, MockResponse | MockResponse[]> = {}) {
      const provider = await openBoard({
        [`POST ${visitUrl}`]: { body: changes },
        [`GET ${visitUrl}/baseline`]: { bytes: baselineState() },
        ...responses,
      })
      act(() => {
        provider.emitSynced()
        // The board as collab gives it, which a viewer's page does not set up itself.
        initializeDocument(provider.document)
        writeCell(getCells(provider.document), shape('kept', 'a0', 'Сервис'))
        writeCell(getCells(provider.document), shape('queue', 'a1', 'Очередь'))
      })
      return provider
    }

    it('tells who changed the board since the last visit and shows the changes in place of the board', async () => {
      const provider = await openChanged()

      const shown = await screen.findByRole('region', { name: 'С прошлого визита' })
      expect(shown).toHaveTextContent(/С вашего прошлого визита \((сегодня|вчера) в \d{1,2}:\d{2}\) доску изменил\(а\) Боб/)
      await userEvent.click(within(shown).getByRole('button', { name: 'Показать изменения' }))

      const view = await screen.findByRole('region', { name: 'Изменения с прошлого визита' })
      expect(view).toHaveTextContent(/Изменения с вашего прошлого визита \((сегодня|вчера) в/)
      const list = await within(view).findByRole('complementary', { name: 'Изменения' })
      expect(within(list).getByText('Добавлено 1 · Изменено 0 · Удалено 0')).toBeInTheDocument()
      expect(within(list).getByRole('button', { name: /Добавлено: Очередь/ })).toBeInTheDocument()
      expect(canvas.document).toBe(provider.document)
      expect(within(view).getByTestId('diagram-canvas')).toHaveAttribute('data-read-only', 'true')
      expect(banner()).toBeNull()
      expect(screen.queryByRole('complementary', { name: 'Фигуры' })).toBeNull()

      await userEvent.click(within(view).getByRole('button', { name: 'Закрыть' }))
      expect(screen.queryByRole('region', { name: 'Изменения с прошлого визита' })).toBeNull()
      expect(screen.getByRole('complementary', { name: 'Фигуры' })).toBeInTheDocument()
      await userEvent.click(within(banner()!).getByRole('button', { name: 'Скрыть' }))
      expect(banner()).toBeNull()
      expect(requests(provider.fetchMock, 'POST', visitUrl)).toHaveLength(1)
    })

    it('shows the changes to a participant who may only view the board, without bringing any back', async () => {
      const provider = await openChanged({ [`GET ${boardUrl}`]: { body: boardToView } })
      act(() => writeCell(getCells(provider.document), shape('kept', 'a0', 'Шлюз')))

      await userEvent.click(await screen.findByRole('button', { name: 'Показать изменения' }))

      const view = await screen.findByRole('region', { name: 'Изменения с прошлого визита' })
      expect(await within(view).findByText('Добавлено 1 · Изменено 1 · Удалено 0')).toBeInTheDocument()
      expect(within(view).queryByRole('button', { name: /^Вернуть/ })).toBeNull()
    })

    it('tells that the changes could not be loaded', async () => {
      await openChanged({ [`GET ${visitUrl}/baseline`]: { status: 404 } })

      await userEvent.click(await screen.findByRole('button', { name: 'Показать изменения' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить изменения')
    })

    it('shows no banner on the first visit and when nobody else changed the board', async () => {
      const first = await openBoard()
      await waitFor(() => expect(requests(first.fetchMock, 'POST', visitUrl)).toHaveLength(1))
      await act(async () => {})
      expect(banner()).toBeNull()
      first.unmount()

      const unchanged = await openBoard({ [`POST ${visitUrl}`]: { body: { since, authors: [], baseline: null } } })
      await waitFor(() => expect(requests(unchanged.fetchMock, 'POST', visitUrl)).toHaveLength(1))
      await act(async () => {})
      expect(banner()).toBeNull()
    })

    it('offers no changes to show when the board has no version to compare with', async () => {
      await openBoard({ [`POST ${visitUrl}`]: { body: { ...changes, baseline: null } } })

      expect(await screen.findByRole('region', { name: 'С прошлого визита' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Показать изменения' })).toBeNull()
    })

    it('closes the changes when the history of versions or the comments open', async () => {
      await openChanged({ [`GET ${boardUrl}/versions`]: { body: [] } })
      await userEvent.click(await screen.findByRole('button', { name: 'Показать изменения' }))
      await screen.findByRole('region', { name: 'Изменения с прошлого визита' })

      await userEvent.click(screen.getByRole('button', { name: 'Меню доски «Архитектура»' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'История версий' }))
      expect(screen.queryByRole('region', { name: 'Изменения с прошлого визита' })).toBeNull()

      await userEvent.click(within(banner()!).getByRole('button', { name: 'Показать изменения' }))
      expect(screen.queryByRole('complementary', { name: 'История версий' })).toBeNull()
      await userEvent.click(screen.getByRole('button', { name: /^Комментарии/ }))
      expect(screen.queryByRole('region', { name: 'Изменения с прошлого визита' })).toBeNull()
    })

    it('tells the backend that the user is on the board and that they left it', async () => {
      const provider = await openBoard()
      await waitFor(() => expect(requests(provider.fetchMock, 'POST', visitUrl)).toHaveLength(1))
      await act(async () => {})

      act(() => document.dispatchEvent(new Event('visibilitychange')))
      expect(requests(provider.fetchMock, 'PUT', visitUrl)).toHaveLength(1)
      provider.unmount()
      expect(requests(provider.fetchMock, 'DELETE', visitUrl)).toHaveLength(1)
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
      await openBoard({ [`GET ${boardUrl}`]: { body: boardToView } })

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

    it('publishes the trail of the laser pointer and the message at the cursor, and drops both without a connection', async () => {
      const provider = await openBoard()
      act(() => provider.emitSynced())
      const editor = canvas.editor!
      const local = () => provider.awareness.getStates().get(provider.awareness.clientID) ?? {}

      act(() => editor.drawLaser({ x: 10, y: 20 }))
      fireEvent.keyDown(document.body, { key: '/' })
      const message = screen.getByRole('textbox', { name: 'Сообщение у курсора' })
      fireEvent.change(message, { target: { value: 'смотри сюда' } })
      expect(local()).toMatchObject({ laser: { strokes: [[[10, 20, 0]]] }, chat: { text: 'смотри сюда' } })

      act(() => provider.emitStatus('disconnected'))

      expect(local()).toMatchObject({ laser: null, chat: null })
      expect(message).not.toBeInTheDocument()
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

    it('names the participant who duplicates a page in the copies of its elements', async () => {
      const { document } = await openPages()
      act(() => {
        document.transact(() =>
          writeCell(getCells(document), {
            id: 'api',
            kind: 'vertex',
            parent: LAYER_CELL_ID,
            order: 'a0',
            value: 'API',
            geometry: { x: 0, y: 0, width: 120, height: 60 },
            source: null,
            target: null,
            style: {},
          }),
        )
      })

      await userEvent.click(screen.getByRole('button', { name: 'Меню страницы «Страница 1»' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Дублировать' }))

      const copy = listPages(document)[1]!
      const [copied] = [...getCells(document, copy.id).values()].filter((cell) => cell.get('value') === 'API')
      expect(readAttribution(copied)).toMatchObject({ by: ALICE.id, name: ALICE.name })
      expect(readAttribution(getCells(document).get('api'))).toBeNull()
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

    describe('following', () => {
      const bob = { name: 'Боб', color: '#dc2626', avatarUrl: null }
      const banner = () => screen.queryByRole('region', { name: 'Следование' })

      async function followBob(provider: Awaited<ReturnType<typeof openPages>>, page: string) {
        act(() => provider.awareness.setState(7, { user: bob, page, viewport: { x: 1500, y: 900, scale: 1.5 } }))
        await userEvent.click(within(screen.getByRole('list', { name: 'Участники' })).getByRole('button', { name: /Боб/ }))
      }

      it('takes the page, the middle of the view and the scale of the leader, and follows their moves', async () => {
        const provider = await openPages()
        let second = ''
        act(() => {
          second = addPage(provider.document, DEFAULT_PAGE_ID, 'Контейнеры')
        })

        await followBob(provider, second)

        expect(shownPage()).toBe(second)
        await waitFor(() => expect(canvas.editor!.zoomTo).toHaveBeenLastCalledWith(1.5))
        expect(canvas.editor!.centerOn).toHaveBeenLastCalledWith(expect.objectContaining({ x: 1500, y: 900 }))
        expect(banner()).toHaveTextContent('Вы следуете за Боб')
        expect(within(screen.getByRole('list', { name: 'Участники' })).getByRole('button', { name: /Боб/ })).toHaveAttribute(
          'aria-pressed',
          'true',
        )

        act(() => provider.awareness.setState(7, { user: bob, page: second, viewport: { x: 200, y: 100, scale: 0.5 } }))
        expect(canvas.editor!.zoomTo).toHaveBeenLastCalledWith(0.5)
        expect(canvas.editor!.centerOn).toHaveBeenLastCalledWith(expect.objectContaining({ x: 200, y: 100 }))

        act(() => provider.awareness.setState(7, { user: bob, page: DEFAULT_PAGE_ID, viewport: { x: 1, y: 2, scale: 1 } }))
        await waitFor(() => expect(shownPage()).toBe(DEFAULT_PAGE_ID))
      })

      it('stops when the viewer presses on the canvas, presses Escape or «Остановить», or the leader leaves', async () => {
        const provider = await openPages()

        await followBob(provider, DEFAULT_PAGE_ID)
        fireEvent.pointerDown(screen.getByTestId('diagram-canvas'))
        expect(banner()).toBeNull()

        await followBob(provider, DEFAULT_PAGE_ID)
        await userEvent.keyboard('{Escape}')
        expect(banner()).toBeNull()

        await followBob(provider, DEFAULT_PAGE_ID)
        await userEvent.click(screen.getByRole('button', { name: 'Остановить' }))
        expect(banner()).toBeNull()

        await followBob(provider, DEFAULT_PAGE_ID)
        act(() => provider.awareness.setState(7, null))
        expect(banner()).toBeNull()
      })

      it('stops when the viewer opens another page on their own', async () => {
        const provider = await openPages()
        let second = ''
        act(() => {
          second = addPage(provider.document, DEFAULT_PAGE_ID, 'Контейнеры')
        })
        await followBob(provider, DEFAULT_PAGE_ID)

        await userEvent.click(screen.getByRole('tab', { name: 'Контейнеры' }))

        expect(shownPage()).toBe(second)
        expect(banner()).toBeNull()
      })
    })

    describe('presenting to everybody', () => {
      const bob = { name: 'Боб', color: '#dc2626', avatarUrl: null }
      const vera = { name: 'Вера', color: '#16a34a', avatarUrl: null }
      const view = { x: 1500, y: 900, scale: 1.5 }
      /** The presence of a participant on the first page with a view. */
      const at = (user: typeof bob, changes: Record<string, unknown> = {}) => ({
        user,
        page: DEFAULT_PAGE_ID,
        viewport: view,
        ...changes,
      })
      const showing = () => screen.queryByRole('region', { name: 'Показ всем' })
      const following = () => screen.queryByRole('region', { name: 'Следование' })
      const local = (provider: Awaited<ReturnType<typeof openPages>>) => provider.awareness.getStates().get(1) ?? {}
      const presentButton = () => screen.getByRole('button', { name: 'Показать всем' })

      it('follows a participant who starts presenting, from another page, and tells whom it follows', async () => {
        const provider = await openPages()
        let second = ''
        act(() => {
          second = addPage(provider.document, DEFAULT_PAGE_ID, 'Контейнеры')
        })
        await userEvent.click(screen.getByRole('tab', { name: 'Страница 1' }))

        act(() => provider.awareness.setState(7, at(bob, { page: second, presenting: 1_000 })))

        expect(shownPage()).toBe(second)
        await waitFor(() => expect(canvas.editor!.zoomTo).toHaveBeenLastCalledWith(1.5))
        expect(canvas.editor!.centerOn).toHaveBeenLastCalledWith(expect.objectContaining({ x: 1500, y: 900 }))
        expect(showing()).toHaveTextContent('Боб показывает всем')
        expect(within(showing()!).getByRole('button', { name: 'Не следовать' })).toBeInTheDocument()
        expect(following()).toBeNull()
        expect(local(provider).following).toBe(7)

        const moved = { x: 200, y: 100, scale: 0.5 }
        act(() => provider.awareness.setState(7, at(bob, { page: second, viewport: moved, presenting: 1_000 })))
        expect(canvas.editor!.zoomTo).toHaveBeenLastCalledWith(0.5)
        expect(canvas.editor!.centerOn).toHaveBeenLastCalledWith(expect.objectContaining({ x: 200, y: 100 }))
      })

      it('follows a presentation that runs when the participant opens the board', async () => {
        const provider = await openBoard()
        act(() => provider.awareness.setState(7, at(bob, { presenting: 1_000 })))

        act(() => provider.emitSynced())

        await waitFor(() => expect(canvas.editor!.zoomTo).toHaveBeenLastCalledWith(1.5))
        expect(showing()).toHaveTextContent('Боб показывает всем')
        expect(screen.getByRole('button', { name: 'Не следовать' })).toBeInTheDocument()
      })

      it('keeps the banner when the viewer moves the canvas on their own, and follows again with «Следовать»', async () => {
        const provider = await openPages()
        act(() => provider.awareness.setState(7, at(bob, { presenting: 1_000 })))

        fireEvent.wheel(screen.getByTestId('diagram-canvas'))
        expect(showing()).toHaveTextContent('Боб показывает всем')
        expect(screen.getByRole('button', { name: 'Следовать' })).toBeInTheDocument()
        expect(local(provider).following).toBeNull()
        vi.mocked(canvas.editor!.zoomTo).mockClear()
        act(() => provider.awareness.setState(7, at(bob, { viewport: { ...view, scale: 2 }, presenting: 1_000 })))
        expect(canvas.editor!.zoomTo).not.toHaveBeenCalled()

        await userEvent.click(screen.getByRole('button', { name: 'Следовать' }))
        expect(screen.getByRole('button', { name: 'Не следовать' })).toBeInTheDocument()
        expect(canvas.editor!.zoomTo).toHaveBeenLastCalledWith(2)
        expect(local(provider).following).toBe(7)
      })

      it('keeps the banner when the viewer presses «Не следовать» or Escape or opens another page', async () => {
        const provider = await openPages()
        let second = ''
        act(() => {
          second = addPage(provider.document, DEFAULT_PAGE_ID, 'Контейнеры')
        })
        await userEvent.click(screen.getByRole('tab', { name: 'Страница 1' }))
        act(() => provider.awareness.setState(7, at(bob, { presenting: 1_000 })))

        // Pressing «Не следовать» is not pressing on the canvas twice: the viewer does not follow again.
        await userEvent.click(screen.getByRole('button', { name: 'Не следовать' }))
        expect(screen.getByRole('button', { name: 'Следовать' })).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Следовать' }))
        await userEvent.keyboard('{Escape}')
        expect(screen.getByRole('button', { name: 'Следовать' })).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Следовать' }))
        await userEvent.click(screen.getByRole('tab', { name: 'Контейнеры' }))
        expect(shownPage()).toBe(second)
        expect(screen.getByRole('button', { name: 'Следовать' })).toBeInTheDocument()
      })

      it('stops following when the presentation ends or its presenter leaves the board', async () => {
        const provider = await openPages()

        act(() => provider.awareness.setState(7, at(bob, { presenting: 1_000 })))
        expect(local(provider).following).toBe(7)
        act(() => provider.awareness.setState(7, at(bob, { presenting: null })))
        expect(showing()).toBeNull()
        expect(following()).toBeNull()
        expect(local(provider).following).toBeNull()

        act(() => provider.awareness.setState(7, at(bob, { presenting: 2_000 })))
        expect(screen.getByRole('button', { name: 'Не следовать' })).toBeInTheDocument()
        act(() => provider.awareness.setState(7, null))
        expect(showing()).toBeNull()
        expect(local(provider).following).toBeNull()
      })

      it('follows a participant who takes the presentation over, also after moving away from the last one', async () => {
        const provider = await openPages()
        act(() => provider.awareness.setState(7, at(bob, { presenting: 1_000 })))
        await userEvent.click(screen.getByRole('button', { name: 'Не следовать' }))

        act(() => {
          provider.awareness.setState(8, at(vera, { presenting: 2_000 }))
          // Bob's client sees the presentation of Vera and ends his own.
          provider.awareness.setState(7, at(bob, { presenting: null }))
        })

        expect(showing()).toHaveTextContent('Вера показывает всем')
        expect(screen.getByRole('button', { name: 'Не следовать' })).toBeInTheDocument()
        expect(local(provider).following).toBe(8)
      })

      it('presents to everybody, counts the participants who follow and ends with «Закончить показ»', async () => {
        const provider = await openPages()
        act(() => {
          provider.awareness.setState(7, at(bob))
          provider.awareness.setState(8, at(vera))
        })

        await userEvent.click(presentButton())

        expect(presentButton()).toHaveAttribute('aria-pressed', 'true')
        expect(local(provider).presenting).toEqual(expect.any(Number))
        expect(showing()).toHaveTextContent('Вы показываете всем · следуют 0')
        // The presenter leads and follows nobody.
        expect(within(screen.getByRole('list', { name: 'Участники' })).queryByRole('button')).toBeNull()
        act(() => provider.awareness.setState(7, at(bob, { following: 1 })))
        expect(showing()).toHaveTextContent('Вы показываете всем · следуют 1')
        act(() => provider.awareness.setState(8, at(vera, { following: 1 })))
        expect(showing()).toHaveTextContent('Вы показываете всем · следуют 2')
        act(() => provider.awareness.setState(8, at(vera, { following: null })))
        expect(showing()).toHaveTextContent('Вы показываете всем · следуют 1')

        await userEvent.click(screen.getByRole('button', { name: 'Закончить показ' }))
        expect(showing()).toBeNull()
        expect(local(provider).presenting).toBeNull()
        expect(presentButton()).toHaveAttribute('aria-pressed', 'false')

        // Pressing the button again ends the presentation too.
        await userEvent.click(presentButton())
        expect(showing()).toHaveTextContent('Вы показываете всем')
        await userEvent.click(presentButton())
        expect(showing()).toBeNull()
      })

      it('presents over the pages the presenter opens', async () => {
        const provider = await openPages()
        await userEvent.click(presentButton())
        const since = local(provider).presenting

        await userEvent.click(screen.getByRole('button', { name: 'Добавить страницу' }))

        expect(local(provider).presenting).toBe(since)
        expect(showing()).toHaveTextContent('Вы показываете всем')
      })

      it('stops presenting when another participant takes it over, and follows them', async () => {
        const provider = await openPages()
        await userEvent.click(presentButton())
        const since = local(provider).presenting as number

        act(() => provider.awareness.setState(7, at(bob, { presenting: since + 1 })))

        expect(local(provider).presenting).toBeNull()
        expect(presentButton()).toHaveAttribute('aria-pressed', 'false')
        expect(showing()).toHaveTextContent('Боб показывает всем')
        expect(screen.getByRole('button', { name: 'Не следовать' })).toBeInTheDocument()
        await waitFor(() => expect(canvas.editor!.zoomTo).toHaveBeenLastCalledWith(1.5))
      })

      it('takes over a presentation started on a clock that is ahead, and follows nobody while presenting', async () => {
        const provider = await openPages()
        const ahead = Date.now() + 60_000
        act(() => provider.awareness.setState(7, at(bob, { presenting: ahead })))
        expect(local(provider).following).toBe(7)

        await userEvent.click(presentButton())

        expect(local(provider).presenting).toBeGreaterThan(ahead)
        expect(local(provider).following).toBeNull()
        expect(showing()).toHaveTextContent('Вы показываете всем')
      })

      it('lets a participant who may only view present, without changing the document', async () => {
        const provider = await openBoard({ [`GET ${boardUrl}`]: { body: boardToView } })
        initializeDocument(provider.document)
        act(() => provider.emitSynced())
        const updates = vi.fn()
        provider.document.on('update', updates)

        await userEvent.click(presentButton())

        expect(local(provider).presenting).toEqual(expect.any(Number))
        expect(showing()).toHaveTextContent('Вы показываете всем')
        expect(updates).not.toHaveBeenCalled()
      })
    })
  })

  describe('comments', () => {
    const threadsUrl = `${boardUrl}/threads`
    const thread = (id: string, changes: Partial<CommentThread> = {}): CommentThread => ({
      id,
      pageId: DEFAULT_PAGE_ID,
      cellId: 'api',
      point: null,
      createdAt: '2026-10-05T10:00:00Z',
      resolvedAt: null,
      resolvedBy: null,
      assignee: null,
      comments: [
        {
          id: `${id}-1`,
          author: { id: 'bob', name: 'Боб', avatarUrl: null },
          body: 'Почему без кэша?',
          mentions: [],
          reactions: [],
          createdAt: '2026-10-05T10:00:00Z',
          editedAt: null,
        },
      ],
      ...changes,
    })
    const panel = () => screen.getByRole('complementary', { name: 'Комментарии' })

    it('shows how many threads are open and opens the comments of the board', async () => {
      const provider = await openBoard({
        [`GET ${threadsUrl}`]: { body: [thread('a'), thread('b', { cellId: null }), thread('c', { resolvedAt: '2026-10-05T11:00:00Z' })] },
      })
      act(() => provider.emitSynced())

      await userEvent.click(await screen.findByRole('button', { name: 'Комментарии (2)' }))

      expect(within(panel()).getAllByRole('article')).toHaveLength(2)
      await userEvent.click(screen.getByRole('button', { name: 'Закрыть комментарии' }))
      expect(screen.queryByRole('complementary', { name: 'Комментарии' })).toBeNull()
    })

    it('lets a viewer comment on an element from its menu and tells the other participants', async () => {
      const created = thread('new')
      const provider = await openBoard({
        [`GET ${boardUrl}`]: { body: boardToView },
        [`GET ${threadsUrl}`]: [{ body: [] }, { body: [created] }],
        [`POST ${threadsUrl}`]: { status: 201, body: created },
      })
      initializeDocument(provider.document)
      act(() => provider.emitSynced())
      await waitFor(() => expect(screen.getByTestId('diagram-canvas')).toHaveAttribute('data-read-only', 'true'))

      act(() => canvas.editor!.rightClick({ x: 10, y: 10, point: { x: 10, y: 10 }, target: 'shape', cellId: 'api' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Комментировать' }))
      const field = within(panel()).getByRole('combobox', { name: 'Новый комментарий' })
      await userEvent.type(field, 'Почему без кэша?{Enter}')

      await waitFor(() => expect(provider.sentStateless).toEqual([COMMENTS_CHANGED]))
      const [[, init]] = requests(provider.fetchMock, 'POST', threadsUrl)
      expect(JSON.parse(init!.body as string)).toEqual({
        pageId: DEFAULT_PAGE_ID,
        cellId: 'api',
        point: null,
        body: 'Почему без кэша?',
        mentions: [],
      })
      expect(await screen.findByRole('button', { name: 'Комментарии (1)' })).toBeInTheDocument()
    })

    it('lets a viewer start a thread at the point of a click with the comment tool, and moves it with the next click', async () => {
      const created = thread('new', { cellId: null, point: { x: 300, y: 90 } })
      const provider = await openBoard({
        [`GET ${boardUrl}`]: { body: boardToView },
        [`GET ${threadsUrl}`]: [{ body: [] }, { body: [created] }],
        [`POST ${threadsUrl}`]: { status: 201, body: created },
      })
      initializeDocument(provider.document)
      act(() => provider.emitSynced())
      await waitFor(() => expect(screen.getByTestId('diagram-canvas')).toHaveAttribute('data-read-only', 'true'))

      await userEvent.click(screen.getByRole('button', { name: 'Комментарий' }))
      expect(canvas.editor!.setCommentTool).toHaveBeenCalledWith(true)
      act(() => canvas.editor!.placeComment({ x: 120.4, y: 80.6 }))
      const draft = within(panel()).getByRole('group', { name: 'Новая ветка' })
      expect(draft).toHaveTextContent('Новая ветка: Место на холсте')
      expect(screen.getByRole('img', { name: 'Новая ветка здесь' }).style.left).toBe('120px')
      await userEvent.type(within(draft).getByRole('combobox', { name: 'Новый комментарий' }), 'Сюда нужен кэш')
      act(() => canvas.editor!.placeComment({ x: 300, y: 90 }))
      expect(screen.getByRole('img', { name: 'Новая ветка здесь' }).style.left).toBe('300px')
      await userEvent.type(within(panel()).getByRole('combobox', { name: 'Новый комментарий' }), '{Enter}')

      await waitFor(() => expect(provider.sentStateless).toEqual([COMMENTS_CHANGED]))
      const [[, init]] = requests(provider.fetchMock, 'POST', threadsUrl)
      expect(JSON.parse(init!.body as string)).toEqual({
        pageId: DEFAULT_PAGE_ID,
        cellId: null,
        point: { x: 300, y: 90 },
        body: 'Сюда нужен кэш',
        mentions: [],
      })
      expect(await screen.findByRole('button', { name: 'Комментарии в точке: 1' })).toBeInTheDocument()
      expect(screen.queryByRole('img', { name: 'Новая ветка здесь' })).toBeNull()
      expect(canvas.editor!.getState().commentTool).toBe(true)
    })

    it('starts a thread at the point of a right click on the empty canvas', async () => {
      const provider = await openBoard()
      act(() => provider.emitSynced())
      await waitFor(() => expect(canvas.editor).not.toBeNull())

      act(() => canvas.editor!.rightClick({ x: 10, y: 10, point: { x: 40, y: 50 }, target: 'canvas', cellId: null }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Комментировать здесь' }))

      expect(within(panel()).getByRole('group', { name: 'Новая ветка' })).toHaveTextContent('Место на холсте')
      expect(screen.getByRole('img', { name: 'Новая ветка здесь' }).style.left).toBe('40px')
    })

    it('opens a thread at a point from its mark, and marks the resolved ones while the panel shows them', async () => {
      const resolved = thread('done', { cellId: null, point: { x: 10, y: 20 }, resolvedAt: '2026-10-05T11:00:00Z' })
      const provider = await openBoard({
        [`GET ${threadsUrl}`]: { body: [thread('a'), thread('here', { cellId: null, point: { x: 100, y: 80 } }), resolved] },
      })
      act(() => provider.emitSynced())

      await userEvent.click(await screen.findByRole('button', { name: 'Комментарии в точке: 1' }))

      expect(within(panel()).getByRole('article', { name: 'Ветка: Место на холсте', current: true })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Комментарии в точке: 1' })).toHaveAttribute('aria-current', 'true')
      expect(screen.queryByRole('button', { name: 'Комментарии в точке (решено): 1' })).toBeNull()
      await userEvent.click(within(panel()).getByRole('button', { name: 'Решённые' }))
      expect(screen.getByRole('button', { name: 'Комментарии в точке (решено): 1' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Закрыть комментарии' }))
      expect(screen.queryByRole('button', { name: 'Комментарии в точке (решено): 1' })).toBeNull()
    })

    it('goes to the page of a thread at a point and brings its point to the middle of the canvas', async () => {
      const provider = await openBoard({
        [`GET ${threadsUrl}`]: { body: [thread('far', { pageId: 'page-2', cellId: null, point: { x: 640, y: 480 } })] },
      })
      act(() => {
        provider.emitSynced()
        provider.document.transact(() => writePage(provider.document, 'page-2', { name: 'Данные', order: 'a5' }))
      })
      await userEvent.click(screen.getByRole('button', { name: 'Комментарии (1)' }))

      const card = within(within(panel()).getByRole('region', { name: 'Данные' })).getByRole('article')
      await userEvent.click(within(card).getByRole('button', { name: 'Место на холсте' }))

      await waitFor(() => expect(screen.getByTestId('diagram-canvas').dataset.page).toBe('page-2'))
      await waitFor(() => expect(canvas.editor!.centerOn).toHaveBeenCalledWith({ x: 640, y: 480 }))
      expect(canvas.editor!.revealCell).not.toHaveBeenCalled()
    })

    it('fetches the comments again when another participant changed them', async () => {
      const provider = await openBoard({ [`GET ${threadsUrl}`]: [{ body: [] }, { body: [thread('a')] }] })
      act(() => provider.emitSynced())
      await screen.findByRole('button', { name: 'Комментарии' })

      act(() => provider.emitStateless(COMMENTS_CHANGED))

      expect(await screen.findByRole('button', { name: 'Комментарии (1)' })).toBeInTheDocument()
      expect(requests(provider.fetchMock, 'GET', threadsUrl)).toHaveLength(2)
    })

    it('opens the threads of an element from its badge on the canvas', async () => {
      const provider = await openBoard({ [`GET ${threadsUrl}`]: { body: [thread('a'), thread('b', { cellId: 'db' })] } })
      act(() => provider.emitSynced())
      act(() => canvas.editor!.placeCell('api', { x: 100, y: 100, width: 120, height: 60 }))

      await userEvent.click(await screen.findByRole('button', { name: 'Комментарии к элементу: 1' }))

      const cards = within(panel()).getAllByRole('article')
      expect(cards[0]).toHaveClass('ring-2')
      expect(cards[1]).not.toHaveClass('ring-2')
    })

    it('goes to the page of a thread and shows its element', async () => {
      const provider = await openBoard({ [`GET ${threadsUrl}`]: { body: [thread('far', { pageId: 'page-2', cellId: 'db' })] } })
      act(() => {
        provider.emitSynced()
        provider.document.transact(() => writePage(provider.document, 'page-2', { name: 'Данные', order: 'a5' }))
      })
      await userEvent.click(screen.getByRole('button', { name: 'Комментарии (1)' }))

      const card = within(within(panel()).getByRole('region', { name: 'Данные' })).getByRole('article')
      await userEvent.click(within(card).getByRole('button', { name: 'Элемент удалён' }))

      await waitFor(() => expect(screen.getByTestId('diagram-canvas').dataset.page).toBe('page-2'))
      await waitFor(() => expect(canvas.editor!.revealCell).toHaveBeenCalledWith('db'))
    })

    it('opens the comments on the thread of a link, on its page and at its element, and takes it out of the address', async () => {
      const provider = await openBoard(
        { [`GET ${threadsUrl}`]: { body: [thread('near'), thread('far', { pageId: 'page-2', cellId: 'db' })] } },
        '?thread=far',
      )
      act(() => {
        provider.emitSynced()
        provider.document.transact(() => writePage(provider.document, 'page-2', { name: 'Данные', order: 'a5' }))
      })

      const card = await within(await screen.findByRole('region', { name: 'Данные' })).findByRole('article')
      expect(card).toHaveAttribute('aria-current', 'true')
      expect(within(panel()).getByRole('article', { name: 'Ветка: Элемент удалён', current: false })).toBeInTheDocument()
      await waitFor(() => expect(screen.getByTestId('diagram-canvas').dataset.page).toBe('page-2'))
      await waitFor(() => expect(canvas.editor!.revealCell).toHaveBeenCalledWith('db'))
      expect(provider.router.state.location.search).toBe('?page=page-2')
    })

    it('opens the comments without a thread when the thread of a link is gone', async () => {
      const provider = await openBoard({ [`GET ${threadsUrl}`]: { body: [thread('near')] } }, '?thread=gone')
      act(() => provider.emitSynced())

      expect(await within(await screen.findByRole('complementary', { name: 'Комментарии' })).findByRole('article')).not.toHaveAttribute(
        'aria-current',
      )
      await waitFor(() => expect(provider.router.state.location.search).toBe(`?page=${DEFAULT_PAGE_ID}`))
    })

    it('closes the comments when the owner opens the history of versions', async () => {
      const provider = await openBoard({ [`GET ${boardUrl}/versions`]: { body: [] } })
      act(() => provider.emitSynced())
      await userEvent.click(screen.getByRole('button', { name: /^Комментарии/ }))

      await userEvent.click(screen.getByRole('button', { name: 'Меню доски «Архитектура»' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'История версий' }))

      expect(screen.queryByRole('complementary', { name: 'Комментарии' })).toBeNull()
      expect(screen.getByRole('complementary', { name: 'История версий' })).toBeInTheDocument()
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
      const imported = readAttribution(getCells(provider.document, 'ctx-page').get('api'))
      expect(imported).toMatchObject({ by: ALICE.id, name: ALICE.name })
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

      const provider = await openSynced()

      expect(tabNames()).toEqual(['Контекст', 'Слои'])
      expect(screen.getByTestId('diagram-canvas').dataset.page).toBe('ctx-page')
      const imported = readAttribution(getCells(provider.document, 'ctx-page').get('db'))
      expect(imported).toMatchObject({ by: ALICE.id, name: ALICE.name })
    })
  })
})
