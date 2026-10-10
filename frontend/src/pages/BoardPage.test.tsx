import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../api/boards.ts'
import type { NotificationSettings } from '../api/notificationSettings.ts'
import { participantColor } from '../board/identity.ts'
import type { CommentThread } from '../api/comments.ts'
import type { Decision } from '../api/decisions.ts'
import { ACCESS_POLL_INTERVAL } from '../board/accessRequests.ts'
import { BOARD_CHANGED, COMMENTS_CHANGED, DECISIONS_CHANGED, PROPOSALS_CHANGED } from '../board/messages.ts'
import type { Proposal } from '../api/proposals.ts'
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
import { DiagramBuilder } from '../templates/builder.ts'
import { restoreDocument } from '../diagram/restore.ts'
import { SHAPE_DRAG_TYPE } from '../diagram/shapes.ts'
import { writeStatus } from '../diagram/status.ts'
import { shapeData } from '../diagram/testing.ts'
import { SAMPLE_DRAWIO } from '../drawio/fixtures.ts'
import { setPendingImport } from '../drawio/files.ts'
import { parseDrawio } from '../drawio/parse.ts'
import { findLocalCopy, loadLocalCopy, openLocalCopy, setUnsentEdits } from '../offline/localCopies.ts'
import type { ImageHost } from '../diagram/images.ts'
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
const canvas = vi.hoisted(() => ({
  editor: null as FakeEditor | null,
  document: null as Y.Doc | null,
  images: null as ImageHost | null,
}))
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
      images = null,
      onEditor,
    }: {
      document: Y.Doc
      pageId: string
      readOnly?: boolean
      participantName?: string
      participantId?: string
      images?: ImageHost | null
      onEditor: (editor: FakeEditor | null) => void
    }) => {
      canvas.images = images
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
  { path: '/boards/:boardId/proposals/:proposalId', element: <p>Черновик предложения</p> },
]
const boardUrl = `/api/boards/${boardId}`

const toRgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

const tokenUrl = `POST /api/boards/${boardId}/collab-token`
const collabToken = (token: string): MockResponse => ({ body: { token, expiresAt: '2026-10-01T10:05:00Z' } })

/** The settings of a user who gets notifications only in the bell. */
const noChannels: NotificationSettings = {
  email: { available: true, channel: null },
  webhook: { available: true, hosts: ['hooks.slack.com'], channel: null },
  mutedBoards: [],
}

/** What the API answers the page of the board by default. */
const apiResponses = (responses: Record<string, MockResponse | MockResponse[]> = {}) => ({
  'GET /api/me': { body: ALICE },
  'GET /api/libraries': { body: [] },
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
  [`GET ${boardUrl}/proposals`]: { body: [] },
  'GET /api/notification-settings': { body: noChannels },
  [`GET ${boardUrl}/decisions`]: { body: [] },
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
      // IndexedDB answers on immediate tasks, which the local copy of a board of an earlier test may still wait for.
      vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
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

      // Stickies show who wrote them, but there is no panel to change them.
      const editor = canvas.editor!
      act(() => editor.placeCell('sticky', { x: 100, y: 100, width: 160, height: 160 }))
      act(() => editor.setState({ stickies: { cellIds: ['sticky'], color: '#fff2cc', textFit: true, locked: false } }))
      act(() => editor.setSignatures([{ cellId: 'sticky', by: null, name: 'Боб', color: '#1f2328' }]))
      expect(screen.queryByRole('toolbar', { name: 'Стикеры' })).toBeNull()
      expect(screen.getByTestId('sticky-signature')).toHaveTextContent('Боб')
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
      act(() => provider.emitConnected())
      // The document of the page, which the canvas of the board shows and the local copy keeps.
      const live = canvas.document!
      await userEvent.click(screen.getByRole('button', { name: 'Меню доски «Архитектура»' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'История версий' }))
      return Object.assign(provider, { live })
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

    it('closes the search and the minimap while a version shows in place of the board, leaving Ctrl+F to the browser', async () => {
      await openHistory({ [`GET ${versionsUrl}/v1`]: { bytes: versionState() } })
      const pressFind = () => {
        let browserFind = true
        act(() => {
          browserFind = fireEvent.keyDown(window.document.body, { key: 'f', code: 'KeyF', ctrlKey: true })
        })
        return browserFind
      }
      const searchBar = () => screen.queryByRole('search', { name: 'Поиск на доске' })
      const minimap = () => screen.queryByRole('region', { name: 'Мини-карта' })
      act(() => canvas.editor!.setState({ hasCells: true }))
      expect(minimap()).toBeInTheDocument()
      expect(pressFind()).toBe(false)
      expect(searchBar()).toBeInTheDocument()

      await userEvent.click(await screen.findByRole('button', { name: /Автоматически/ }))
      const preview = await screen.findByRole('region', { name: /^Версия от / })

      expect(minimap()).toBeNull()
      expect(searchBar()).toBeNull()
      expect(pressFind()).toBe(true)
      expect(searchBar()).toBeNull()

      await userEvent.click(within(preview).getByRole('button', { name: 'Закрыть' }))
      expect(searchBar()).toBeNull()
      expect(pressFind()).toBe(false)
      expect(searchBar()).toBeInTheDocument()
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

    it('restores a version or its page only while the board is synced, not from a board behind collab', async () => {
      const provider = await openHistory({ [`GET ${versionsUrl}/v1`]: { bytes: comparedState() } })
      act(() => provider.emitStatus('disconnected'))
      await userEvent.click(await screen.findByRole('button', { name: /Автоматически/ }))
      const preview = await screen.findByRole('region', { name: /^Версия от / })
      await within(preview).findByTestId('diagram-canvas')

      const hint = 'Версию и страницу можно восстановить после синхронизации'
      for (const name of ['Восстановить эту версию', 'Восстановить страницу']) {
        expect(within(preview).getByRole('button', { name })).toBeDisabled()
        expect(within(preview).getByRole('button', { name })).toHaveAccessibleDescription(hint)
      }
      // Restoring cells is an ordinary change, which a participant may make without a connection too.
      act(() => canvas.editor!.select(['cache']))
      expect(within(preview).getByRole('button', { name: 'Восстановить выделенное' })).toBeEnabled()

      act(() => provider.emitConnected())
      expect(within(preview).getByRole('button', { name: 'Восстановить эту версию' })).toBeEnabled()
      expect(within(preview).getByRole('button', { name: 'Восстановить страницу' })).toBeEnabled()
      expect(within(preview).queryByText(hint)).toBeNull()
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
        expect(canvas.document).toBe(provider.live)
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
        const before = Y.encodeStateVector(provider.live)

        await screen.findByRole('complementary', { name: 'Изменения' })
        await userEvent.click(screen.getByRole('button', { name: /Изменено: Шлюз/ }))
        await userEvent.click(screen.getByRole('tab', { name: 'Черновик' }))

        expect(Y.encodeStateVector(provider.live)).toEqual(before)
      })

      it('offers the migration of the schema from the version to the board, and changes nothing in the board', async () => {
        // The table `users` with the field `mail` in the version and the same field renamed `email` on the board.
        const users = (field: string): CellData[] => [
          { ...shape('users', 'a5', 'users', { x: 0, y: 500 }), style: { childLayout: 'stackLayout', dbVendor: 'postgresql' } },
          { ...shape('users-id', 'a0', 'id uuid PK', { x: 0, y: 30 }), parent: 'users' },
          { ...shape('users-mail', 'a1', field, { x: 0, y: 56 }), parent: 'users' },
        ]
        const versionDocument = new Y.Doc()
        initializeDocument(versionDocument)
        versionDocument.transact(() => users('mail text').forEach((cell) => writeCell(getCells(versionDocument), cell)))
        const provider = await openHistory({ [`GET ${versionsUrl}/v1`]: { bytes: Y.encodeStateAsUpdate(versionDocument) } })
        provider.document.transact(() => users('email text').forEach((cell) => writeCell(getCells(provider.document), cell)))
        await userEvent.click(await screen.findByRole('button', { name: /Автоматически/ }))
        const preview = await screen.findByRole('region', { name: /^Версия от / })
        await within(preview).findByTestId('diagram-canvas')
        expect(within(preview).queryByRole('button', { name: 'Миграция SQL' })).toBeNull()
        await userEvent.click(within(preview).getByRole('button', { name: 'Сравнить с текущей' }))
        const before = Y.encodeStateVector(provider.live)

        await userEvent.click(within(preview).getByRole('button', { name: 'Миграция SQL' }))

        const dialog = screen.getByRole('dialog', { name: 'Миграция SQL' })
        expect(dialog).toHaveTextContent(/Из «версия от .+» в «текущая доска»/)
        const sql = within(dialog).getByRole('textbox', { name: 'Текст Архитектура — миграция.sql' })
        expect((sql as HTMLTextAreaElement).value).toContain('\nALTER TABLE users RENAME COLUMN mail TO email;\n')
        expect(Y.encodeStateVector(provider.live)).toEqual(before)
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
        expect(canvas.document).not.toBe(provider.live)
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
        expect(canvas.document).not.toBe(provider.live)
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
        expect(canvas.document).toBe(provider.live)
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
        expect(canvas.document).toBe(provider.live)
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
      expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Создать копию', 'История версий'])
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
      await userEvent.click(screen.getByRole('button', { name: 'Меню доски «Архитектура»' }))
      const menu = screen.getByRole('menu', { name: 'Доска «Архитектура»' })
      expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Создать копию'])
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
      // The document of the page, which the canvas of the board shows and the local copy keeps.
      return Object.assign(provider, { live: canvas.document! })
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
      expect(canvas.document).toBe(provider.live)
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
      expect(confirmation).toHaveTextContent('Переместить доску «Архитектура» в корзину? Её можно восстановить в течение 30 дней.')
      await userEvent.click(within(confirmation).getByRole('button', { name: 'Удалить' }))

      await waitFor(() => expect(provider.router.state.location.pathname).toBe('/'))
      expect(requests(provider.fetchMock, 'DELETE', boardUrl)).toHaveLength(1)
      expect(provider.sentStateless).toEqual([BOARD_CHANGED])
      expect(provider.destroyed).toBe(true)
      // Nor does the deleted board stay in the browser.
      await waitFor(() => expect(findLocalCopy(ALICE.id, boardId)).toBeNull())
    })

    it('shows a participant who does not own the board its title, with a menu that only copies it', async () => {
      await openBoard({ [`GET ${boardUrl}`]: { body: boardToView } })

      expect(screen.getByRole('heading', { name: 'Архитектура', level: 2 })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Архитектура' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Меню доски «Архитектура»' }))
      const menu = screen.getByRole('menu', { name: 'Доска «Архитектура»' })
      expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Создать копию'])
    })

    it('lets a viewer copy the board and opens the copy', async () => {
      const copy = { ...boardToView, id: 'copy-1', title: 'Архитектура (копия)', role: 'owner' }
      const provider = await openBoard({
        [`GET ${boardUrl}`]: { body: boardToView },
        [`POST ${boardUrl}/copy`]: { status: 201, body: copy },
        'GET /api/boards/copy-1': { body: copy },
      })

      await userEvent.click(screen.getByRole('button', { name: 'Меню доски «Архитектура»' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Создать копию' }))

      await waitFor(() => expect(provider.router.state.location.pathname).toBe('/boards/copy-1'))
      expect(requests(provider.fetchMock, 'POST', `${boardUrl}/copy`)).toHaveLength(1)
    })

    it('tells why a copy failed when the user owns as many boards as allowed', async () => {
      await openBoard({
        [`GET ${boardUrl}`]: { body: boardToView },
        [`POST ${boardUrl}/copy`]: { status: 409, body: { title: 'Board limit reached', limit: 100 } },
      })

      await userEvent.click(screen.getByRole('button', { name: 'Меню доски «Архитектура»' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Создать копию' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Достигнут лимит 100 досок')
    })

    it('lets a viewer with an email for notifications stop and restart those of the board from its menu', async () => {
      const withEmail: NotificationSettings = {
        ...noChannels,
        email: {
          available: true,
          channel: {
            address: 'alice@example.com',
            verified: true,
            verificationSentAt: null,
            enabled: true,
            events: ['mentions'],
            lastDeliveredAt: null,
            lastError: null,
            lastErrorAt: null,
          },
        },
      }
      const muted = { ...withEmail, mutedBoards: [{ boardId, boardTitle: 'Архитектура', mutedAt: '2026-10-08T10:00:00Z' }] }
      const provider = await openBoard({
        [`GET ${boardUrl}`]: { body: boardToView },
        'GET /api/notification-settings': [{ body: withEmail }, { body: muted }, { body: withEmail }],
        [`PUT ${boardUrl}/notification-mute`]: { status: 204 },
        [`DELETE ${boardUrl}/notification-mute`]: { status: 204 },
      })

      await userEvent.click(await screen.findByRole('button', { name: 'Меню доски «Архитектура»' }))
      expect(screen.queryByRole('menuitem', { name: 'История версий' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('menuitem', { name: 'Не присылать уведомления' }))
      expect(requests(provider.fetchMock, 'PUT', `${boardUrl}/notification-mute`)).toHaveLength(1)

      await userEvent.click(screen.getByRole('button', { name: 'Меню доски «Архитектура»' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Присылать уведомления' }))
      expect(requests(provider.fetchMock, 'DELETE', `${boardUrl}/notification-mute`)).toHaveLength(1)
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

    it('stores the images of the participant on the board, and tells under the header why one was not added', async () => {
      await openEditor()
      const images = canvas.images!

      expect(images.holds(`/api/boards/${boardId}/images/0199a000-0000-7000-8000-0000000000aa`)).toBe(true)
      await act(() => images.store(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })))

      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent('Формат файла не поддерживается: PNG, JPEG, GIF или WebP')
      await userEvent.click(within(alert).getByRole('button', { name: 'Понятно' }))
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('stores no images of a participant who only views', async () => {
      canvas.images = createFakeEditor() as never
      const provider = await openBoard({ [`GET /api/boards/${boardId}`]: { body: boardToView } })
      initializeDocument(provider.document)
      act(() => provider.emitSynced())

      expect(screen.getByTestId('diagram-canvas')).toHaveAttribute('data-read-only', 'true')
      expect(canvas.images).toBeNull()
    })

    it('shows the shape palette, the toolbar and the participants', async () => {
      await openEditor()

      const palette = screen.getByRole('complementary', { name: 'Фигуры' })
      expect(within(palette).getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual([
        'Основные',
        'База данных',
        'Структуры',
        'Блок-схемы',
        'BPMN',
        'Архитектура',
        'Инфраструктура',
        'Данные и сообщения',
        'Клиенты',
        'UML',
        'UML: варианты использования',
        'C4',
        'Провайдеры',
      ])
      const basic = within(palette).getByRole('group', { name: 'Основные' })
      expect(within(basic).getAllByRole('button').map((button) => button.textContent)).toEqual([
        'Прямоугольник',
        'Скруглённый прямоугольник',
        'Эллипс',
        'Ромб',
        'Треугольник',
        'Шестиугольник',
        'Пятиугольник',
        'Звезда',
        'Текст',
        'Стикер',
        'Изображение',
      ])
      const toolbar = screen.getByRole('toolbar', { name: 'Инструменты' })
      expect(within(toolbar).getByRole('button', { name: 'Отменить' })).toBeDisabled()
      expect(within(toolbar).getByRole('button', { name: 'Повторить' })).toBeDisabled()
      expect(within(toolbar).getByRole('button', { name: 'Масштаб' })).toHaveTextContent('100%')
      expect(screen.getByRole('list', { name: 'Участники' })).toBeInTheDocument()
    })

    it('keeps the tools of a narrow screen behind «Инструменты» and the palette behind «Фигуры», which a selection closes', async () => {
      const editor = await openEditor()
      const tools = screen.getByRole('button', { name: 'Инструменты' })
      // The styles of a narrow screen hide them; a wide one shows them whatever the button says.
      const toolbarLine = screen.getByRole('toolbar', { name: 'Инструменты' }).parentElement!
      expect(tools).toHaveAttribute('aria-expanded', 'false')
      expect(toolbarLine).toHaveClass('max-lg:hidden')
      await userEvent.click(tools)
      expect(tools).toHaveAttribute('aria-expanded', 'true')
      expect(toolbarLine).not.toHaveClass('max-lg:hidden')

      const shapes = screen.getByRole('button', { name: 'Фигуры' })
      const palette = screen.getByRole('complementary', { name: 'Фигуры' }).parentElement!
      expect(palette).toHaveClass('max-md:hidden')
      await userEvent.click(shapes)
      expect(shapes).toHaveAttribute('aria-expanded', 'true')
      expect(palette).not.toHaveClass('max-md:hidden')
      act(() => editor.select(['shape-1']))
      expect(shapes).toHaveAttribute('aria-expanded', 'false')
      expect(palette).toHaveClass('max-md:hidden')
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

    it('shows the panel of stickies under the selected stickies, and who wrote the stickies of the page', async () => {
      const editor = await openEditor()
      act(() => editor.placeCell('sticky', { x: 100, y: 100, width: 160, height: 160 }))
      expect(screen.queryByRole('toolbar', { name: 'Стикеры' })).toBeNull()

      act(() => editor.setState({ stickies: { cellIds: ['sticky'], color: '#fff2cc', textFit: true, locked: false } }))
      act(() => editor.setSignatures([{ cellId: 'sticky', by: ALICE.id, name: 'Алиса', color: '#1f2328' }]))

      await userEvent.click(within(screen.getByRole('toolbar', { name: 'Стикеры' })).getByRole('button', { name: 'Розовый' }))
      expect(editor.setStickyColor).toHaveBeenCalledWith('#f8cecc')
      expect(screen.getByTestId('sticky-signature')).toHaveTextContent('Алиса')
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
      act(() => provider.emitConnected())
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

    it('makes a view of the model in the window of its rule, opens it under its bar and keeps it in line with the model', async () => {
      const { document } = await openPages()
      const drawn = new DiagramBuilder()
      drawn.shape('c4-boundary', 0, 0, { value: 'Магазин\n[Software System]', width: 800, height: 500 })
      drawn.shape('c4-container', 40, 80, { value: 'API\n[Container]' })
      act(() => document.transact(() => drawn.build().forEach((cell) => writeCell(getCells(document), cell))))

      await userEvent.click(screen.getByRole('button', { name: 'Новое представление' }))
      await userEvent.click(within(screen.getByRole('dialog', { name: 'Новое представление' })).getByRole('button', { name: 'Создать' }))

      const view = listPages(document)[1]!
      expect(view).toMatchObject({ name: 'Магазин: контейнеры', view: { rule: { kind: 'containers' } } })
      expect(screen.getByRole('tab', { name: 'Магазин: контейнеры' })).toHaveAttribute('aria-selected', 'true')
      expect(shownPage()).toBe(view.id)
      expect(screen.getByRole('region', { name: 'Представление' })).toHaveTextContent('Контейнеры системы Магазин')
      const names = () =>
        Array.from(getCells(document, view.id).values())
          .filter((cell) => cell.get('kind') === 'vertex')
          .map((cell) => String(cell.get('value')).split('\n')[0])
          .sort()
      expect(names()).toEqual(['API', 'Магазин'])

      // Who edits the board keeps the view in line: a container drawn in the boundary appears on it.
      const more = new DiagramBuilder()
      more.shape('service', 400, 80, { value: 'Склад' })
      act(() => document.transact(() => more.build().forEach((cell) => writeCell(getCells(document), cell))))
      expect(names()).toEqual(['API', 'Магазин', 'Склад'])
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

    describe('minimap', () => {
      const bob = { name: 'Боб', color: '#dc2626', avatarUrl: null }
      const minimap = () => screen.queryByRole('region', { name: 'Мини-карта' })
      const banner = () => screen.queryByRole('region', { name: 'Следование' })

      it('shows the page with shapes small, with the other participants of the page where they look', async () => {
        const provider = await openPages()
        expect(minimap()).toBeNull()

        act(() => canvas.editor!.setState({ hasCells: true }))
        const viewport = { x: 100, y: 50, scale: 1 }
        act(() => provider.awareness.setState(7, { user: bob, page: DEFAULT_PAGE_ID, viewport }))

        expect(minimap()).toBeInTheDocument()
        expect(screen.getByTestId('minimap-participant')).toHaveAttribute('data-participant', 'Боб')
      })

      it('ends following when it moves the canvas, but not when it collapses', async () => {
        const provider = await openPages()
        act(() => canvas.editor!.setState({ hasCells: true }))
        const viewport = { x: 1500, y: 900, scale: 1 }
        act(() => provider.awareness.setState(7, { user: bob, page: DEFAULT_PAGE_ID, viewport }))
        const participants = screen.getByRole('list', { name: 'Участники' })
        await userEvent.click(within(participants).getByRole('button', { name: /Боб/ }))
        expect(banner()).toHaveTextContent('Вы следуете за Боб')

        await userEvent.click(screen.getByRole('button', { name: 'Свернуть мини-карту' }))
        await userEvent.click(screen.getByRole('button', { name: 'Развернуть мини-карту' }))
        expect(banner()).toBeInTheDocument()

        fireEvent.pointerDown(screen.getByTestId('minimap'), { button: 0, pointerId: 1, clientX: 5, clientY: 5 })

        expect(banner()).toBeNull()
        expect(canvas.editor!.centerOn).toHaveBeenCalled()
      })
    })

    describe('search on the board', () => {
      const searchBar = () => screen.queryByRole('search', { name: 'Поиск на доске' })
      const searchField = () => screen.getByRole('searchbox', { name: 'Найти на доске' })
      /** Presses Ctrl+F on the page; `false` when the browser would not open its own find. */
      const pressFind = () => {
        let browserFind = true
        act(() => {
          browserFind = fireEvent.keyDown(window.document.body, { key: 'f', code: 'KeyF', ctrlKey: true })
        })
        return browserFind
      }
      const element = (id: string, value: string, parent = LAYER_CELL_ID): CellData => ({
        id,
        kind: 'vertex',
        parent,
        order: 'a0',
        value,
        geometry: { x: 0, y: 30, width: 220, height: 26 },
        source: null,
        target: null,
        style: {},
      })
      /** «Customer API» on the first page, the field `customer_id uuid` of the table `orders` on the page «Данные». */
      function fill(document: Y.Doc) {
        document.transact(() => {
          writePage(document, 'page-2', { name: 'Данные', order: 'a5' })
          writeCell(getCells(document), element('api', 'Customer API'))
          writeCell(getCells(document, 'page-2'), element('orders', 'orders'))
          writeCell(getCells(document, 'page-2'), element('customer-id', 'customer_id uuid', 'orders'))
        })
      }

      it('finds texts on every page with Ctrl+F and goes to the page of a match with Enter, and back', async () => {
        const provider = await openPages()
        act(() => fill(provider.document))

        expect(pressFind()).toBe(false)
        await userEvent.type(searchField(), 'customer')

        expect(within(searchBar()!).getByText('1 из 2')).toBeInTheDocument()
        expect(canvas.editor!.revealCell).toHaveBeenLastCalledWith('api')

        await userEvent.keyboard('{Enter}')

        await waitFor(() => expect(shownPage()).toBe('page-2'))
        await waitFor(() => expect(canvas.editor!.revealCell).toHaveBeenCalledWith('customer-id'))
        expect(canvas.editor!.pageId).toBe('page-2')
        expect(currentTab()).toHaveTextContent('Данные')
        expect(provider.router.state.location.search).toBe('?page=page-2')
        expect(within(searchBar()!).getByText('2 из 2')).toBeInTheDocument()
        expect(searchField()).toHaveFocus()

        await userEvent.keyboard('{Shift>}{Enter}{/Shift}')

        await waitFor(() => expect(shownPage()).toBe(DEFAULT_PAGE_ID))
        await waitFor(() => expect(canvas.editor!.revealCell).toHaveBeenCalledWith('api'))
        expect(within(searchBar()!).getByText('1 из 2')).toBeInTheDocument()

        const canvasOfPage = canvas.editor!
        await userEvent.keyboard('{Escape}')
        expect(searchBar()).toBeNull()
        expect(canvasOfPage.focus).toHaveBeenCalled()
      })

      it('ends following another participant when it goes to a match, but not when the field is pressed', async () => {
        const provider = await openPages()
        act(() => fill(provider.document))
        const banner = () => screen.queryByRole('region', { name: 'Следование' })
        act(() =>
          provider.awareness.setState(7, {
            user: { name: 'Боб', color: '#dc2626', avatarUrl: null },
            page: DEFAULT_PAGE_ID,
            viewport: { x: 1500, y: 900, scale: 1.5 },
          }),
        )
        await userEvent.click(within(screen.getByRole('list', { name: 'Участники' })).getByRole('button', { name: /Боб/ }))
        expect(banner()).toHaveTextContent('Вы следуете за Боб')

        pressFind()
        await userEvent.click(searchField())
        expect(banner()).toBeInTheDocument()

        await userEvent.type(searchField(), 'customer_id')

        expect(banner()).toBeNull()
        await waitFor(() => expect(shownPage()).toBe('page-2'))
        await waitFor(() => expect(canvas.editor!.revealCell).toHaveBeenCalledWith('customer-id'))
      })

      it('lets a participant who may only view search the board, changing nothing', async () => {
        const provider = await openBoard({ [`GET ${boardUrl}`]: { body: boardToView } })
        const stored = new Y.Doc()
        initializeDocument(stored)
        fill(stored)
        act(() => {
          Y.applyUpdate(provider.document, Y.encodeStateAsUpdate(stored))
          provider.emitSynced()
        })
        const updates = vi.fn()
        provider.document.on('update', updates)

        pressFind()
        await userEvent.type(searchField(), 'customer_id')

        expect(within(searchBar()!).getByText('1 из 1')).toBeInTheDocument()
        await waitFor(() => expect(shownPage()).toBe('page-2'))
        await waitFor(() => expect(canvas.editor!.revealCell).toHaveBeenCalledWith('customer-id'))
        expect(canvas.editor!.readOnly).toBe(true)
        expect(updates).not.toHaveBeenCalled()
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

  describe('links', () => {
    const shownPage = () => screen.getByTestId('diagram-canvas').dataset.page

    it('sets the link of an element in the window that its menu opens', async () => {
      const provider = await openBoard({ 'GET /api/boards': { body: [] }, 'GET /api/boards/shared': { body: [] } })
      act(() => provider.emitConnected())
      let containers = ''
      act(() => {
        containers = addPage(provider.document, DEFAULT_PAGE_ID)
        renamePage(provider.document, containers, 'Контейнеры')
      })
      const editor = canvas.editor!
      act(() => editor.setState({ link: { cellId: 'api', link: null, canChange: true } }))

      act(() => editor.rightClick({ x: 10, y: 10, point: { x: 10, y: 10 }, target: 'shape', cellId: 'api' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Ссылка…' }))
      const dialog = await screen.findByRole('dialog', { name: 'Ссылка' })
      expect(within(dialog).getByRole('combobox', { name: 'Страница' })).toHaveValue(containers)
      await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))

      expect(editor.setLink).toHaveBeenCalledWith(`data:page/id,${containers}`)
      expect(screen.queryByRole('dialog', { name: 'Ссылка' })).toBeNull()
    })

    it('goes to the page of a link with the badge and with Ctrl+click, a viewer too', async () => {
      const provider = await openBoard({ [`GET ${boardUrl}`]: { body: boardToView } })
      const document = new Y.Doc()
      initializeDocument(document)
      const containers = addPage(document, DEFAULT_PAGE_ID)
      act(() => {
        Y.applyUpdate(provider.document, Y.encodeStateAsUpdate(document))
        provider.emitSynced()
      })
      await waitFor(() => expect(screen.getByTestId('diagram-canvas')).toHaveAttribute('data-read-only', 'true'))
      const editor = canvas.editor!
      editor.placeCell('api', { x: 100, y: 50, width: 120, height: 60 })
      act(() => editor.placeLinks([{ cellId: 'api', link: `data:page/id,${containers}` }]))

      act(() => editor.rightClick({ x: 10, y: 10, point: { x: 10, y: 10 }, target: 'shape', cellId: 'api' }))
      expect(screen.queryByRole('menuitem', { name: 'Ссылка…' })).toBeNull()
      await userEvent.keyboard('{Escape}')
      await userEvent.click(screen.getByRole('button', { name: 'Перейти по ссылке: Страница «Страница 2»' }))
      await waitFor(() => expect(shownPage()).toBe(containers))

      act(() => canvas.editor!.clickLink({ cellId: 'back', link: `data:page/id,${DEFAULT_PAGE_ID}` }))
      await waitFor(() => expect(shownPage()).toBe(DEFAULT_PAGE_ID))
    })
  })

  describe('decisions', () => {
    const decisionsUrl = `${boardUrl}/decisions`
    const kafka: Decision = {
      id: 'kafka',
      number: 8,
      title: 'Kafka для событий',
      status: 'accepted',
      supersededBy: null,
      decidedOn: '2026-10-09',
      author: null,
      context: '',
      options: '',
      outcome: '',
      consequences: '',
      elements: [{ pageId: DEFAULT_PAGE_ID, cellId: 'api' }],
      createdAt: '2026-10-09T10:00:00Z',
      updatedAt: '2026-10-09T10:00:00Z',
    }
    const discussion: CommentThread = {
      id: 'discussion',
      pageId: DEFAULT_PAGE_ID,
      cellId: null,
      point: null,
      decisionId: 'kafka',
      createdAt: '2026-10-09T10:00:00Z',
      resolvedAt: null,
      resolvedBy: null,
      assignee: null,
      comments: [],
    }
    const panel = () => screen.getByRole('complementary', { name: 'Решения' })

    it('opens the decisions of an element from its badge, fetched again when another participant changed them', async () => {
      const provider = await openBoard({ [`GET ${decisionsUrl}`]: [{ body: [] }, { body: [kafka] }] })
      act(() => provider.emitSynced())
      act(() => canvas.editor!.placeCell('api', { x: 100, y: 100, width: 120, height: 60 }))
      await screen.findByRole('button', { name: 'Решения' })
      expect(screen.queryByTestId('decision-badge')).toBeNull()

      act(() => provider.emitStateless(DECISIONS_CHANGED))
      await userEvent.click(await screen.findByRole('button', { name: 'Решения элемента: 1' }))

      expect(within(panel()).getByRole('article', { name: 'ADR-0008 Kafka для событий' })).toBeInTheDocument()
      expect(within(panel()).getByRole('button', { name: 'Все решения' })).toBeInTheDocument()
      expect(requests(provider.fetchMock, 'GET', decisionsUrl)).toHaveLength(2)
    })

    it('shows the decisions in place of the comments', async () => {
      const provider = await openBoard()
      act(() => provider.emitSynced())

      await userEvent.click(await screen.findByRole('button', { name: 'Комментарии' }))
      await userEvent.click(screen.getByRole('button', { name: 'Решения' }))

      expect(panel()).toBeInTheDocument()
      expect(screen.queryByRole('complementary', { name: 'Комментарии' })).toBeNull()
      await userEvent.click(screen.getByRole('button', { name: 'Комментарии' }))
      expect(screen.queryByRole('complementary', { name: 'Решения' })).toBeNull()
    })

    it('keeps the discussions of decisions out of the comments and opens the decision of a linked one', async () => {
      const provider = await openBoard(
        {
          [`GET ${boardUrl}/threads`]: { body: [discussion] },
          [`GET ${decisionsUrl}`]: { body: [kafka] },
        },
        '?thread=discussion',
      )
      act(() => provider.emitSynced())

      const card = await within(await screen.findByRole('complementary', { name: 'Решения' })).findByRole('article', {
        name: 'ADR-0008 Kafka для событий',
      })
      expect(card).toHaveAttribute('aria-current', 'true')
      expect(within(card).getByRole('article', { name: 'Ветка: Обсуждение решения' })).toHaveAttribute('aria-current', 'true')
      expect(screen.getByRole('button', { name: 'Комментарии' })).toBeInTheDocument()
      await waitFor(() => expect(provider.router.state.location.search).toBe(`?page=${DEFAULT_PAGE_ID}`))
      expect(canvas.editor!.revealCell).not.toHaveBeenCalled()
    })
  })

  describe('comments', () => {
    const threadsUrl = `${boardUrl}/threads`
    const thread = (id: string, changes: Partial<CommentThread> = {}): CommentThread => ({
      id,
      pageId: DEFAULT_PAGE_ID,
      cellId: 'api',
      point: null,
      decisionId: null,
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

    it('opens the thread of a link once the board is synced, not on a local copy that may lack its element', async () => {
      // An earlier visit left a copy of the board from before the element of the thread was added.
      const stored = new Y.Doc()
      const persistence = openLocalCopy(ALICE.id, boardId, board.title, stored)!
      await persistence.whenSynced
      initializeDocument(stored)
      await persistence.destroy()
      const provider = await openBoard({ [`GET ${threadsUrl}`]: { body: [thread('far', { cellId: 'db' })] } }, '?thread=far')

      // IndexedDB answers asynchronously, slower when the tests run in parallel.
      expect(await screen.findByTestId('diagram-canvas', undefined, { timeout: 5_000 })).toBeInTheDocument()
      expect(await screen.findByRole('button', { name: 'Комментарии (1)' })).toBeInTheDocument()
      expect(screen.queryByRole('complementary', { name: 'Комментарии' })).toBeNull()
      expect(canvas.editor!.revealCell).not.toHaveBeenCalled()
      expect(provider.router.state.location.search).toContain('thread=far')

      act(() => provider.emitConnected())

      expect(await within(await screen.findByRole('complementary', { name: 'Комментарии' })).findByRole('article')).toHaveAttribute(
        'aria-current',
        'true',
      )
      await waitFor(() => expect(canvas.editor!.revealCell).toHaveBeenCalledWith('db'))
      expect(provider.router.state.location.search).toBe(`?page=${DEFAULT_PAGE_ID}`)
    })

    it('opens the thread at a point of a link, e.g. an assigned one, once the board is synced with the page the copy lacks', async () => {
      // An earlier visit left a copy of the board from before the page of the thread was added.
      const stored = new Y.Doc()
      const persistence = openLocalCopy(ALICE.id, boardId, board.title, stored)!
      await persistence.whenSynced
      initializeDocument(stored)
      await persistence.destroy()
      const provider = await openBoard(
        { [`GET ${threadsUrl}`]: { body: [thread('far', { pageId: 'page-2', cellId: null, point: { x: 640, y: 480 } })] } },
        '?thread=far',
      )

      // IndexedDB answers asynchronously, slower when the tests run in parallel.
      expect(await screen.findByTestId('diagram-canvas', undefined, { timeout: 5_000 })).toBeInTheDocument()
      expect(await screen.findByRole('button', { name: 'Комментарии (1)' })).toBeInTheDocument()
      expect(screen.queryByRole('complementary', { name: 'Комментарии' })).toBeNull()
      expect(provider.router.state.location.search).toContain('thread=far')

      act(() => {
        provider.document.transact(() => writePage(provider.document, 'page-2', { name: 'Данные', order: 'a5' }))
        provider.emitConnected()
      })

      const card = await within(await screen.findByRole('region', { name: 'Данные' })).findByRole('article')
      expect(card).toHaveAttribute('aria-current', 'true')
      await waitFor(() => expect(screen.getByTestId('diagram-canvas').dataset.page).toBe('page-2'))
      await waitFor(() => expect(canvas.editor!.centerOn).toHaveBeenCalledWith({ x: 640, y: 480 }))
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
      act(() => provider.emitConnected())
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

      // The pictures of the board go into the file first.
      await waitFor(() => expect(click).toHaveBeenCalled())
      const xml = await blobs[0]!.text()
      expect(Array.from(xml.matchAll(/<diagram [^>]*name="([^"]+)"/g), (match) => match[1])).toEqual(['Контекст', 'Контейнеры'])
      click.mockRestore()
    })

    it('fills a board created from a file once its document is synced', async () => {
      setPendingImport(boardId, await parseDrawio(SAMPLE_DRAWIO))

      const provider = await openSynced()

      // The pictures of the file are stored on the board first.
      await waitFor(() => expect(tabNames()).toEqual(['Контекст', 'Слои']))
      await waitFor(() => expect(screen.getByTestId('diagram-canvas').dataset.page).toBe('ctx-page'))
      const imported = readAttribution(getCells(provider.document, 'ctx-page').get('db'))
      expect(imported).toMatchObject({ by: ALICE.id, name: ALICE.name })
    })
  })

  describe('proposals', () => {
    const proposalsUrl = `${boardUrl}/proposals`
    const proposalId = '0199a000-0000-7000-8000-000000000301'
    const proposalUrl = `${proposalsUrl}/${proposalId}`
    const BOB = { id: '0199a000-0000-7000-8000-0000000000b1', name: 'Боб', avatarUrl: null }
    const proposal = (changes: Partial<Proposal> = {}): Proposal => ({
      id: proposalId,
      boardId,
      title: 'Добавить очередь',
      description: 'Между API и БД',
      status: 'open',
      author: BOB,
      createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      decidedAt: null,
      decidedBy: null,
      comment: null,
      ...changes,
    })
    const cell = (id: string, order: string, value: string): CellData => ({
      id,
      kind: 'vertex',
      parent: LAYER_CELL_ID,
      order,
      value,
      geometry: { x: 100, y: 100, width: 120, height: 60 },
      source: null,
      target: null,
      style: {},
    })
    const draftProvider = () =>
      FakeHocuspocusProvider.instances.findLast((instance) => instance.configuration.name === `proposal:${proposalId}`)!

    /** The board when the proposal was made: «API» and «БД» on its first page. */
    function baseState() {
      const doc = new Y.Doc()
      initializeDocument(doc)
      doc.transact(() => {
        writeCell(getCells(doc), cell('api', 'a0', 'API'))
        writeCell(getCells(doc), cell('db', 'a1', 'БД'))
      })
      return Y.encodeStateAsUpdate(doc)
    }

    /**
     * Opens the review of the proposal of Боб as its reviewer: the board has «БД» renamed to «Хранилище» since the base,
     * and the draft adds «Очередь» and renames «БД» to «PostgreSQL».
     */
    async function openReview(responses: Record<string, MockResponse | MockResponse[]> = {}) {
      // One state for the base, the board and the draft: they share its elements, as states of one document do.
      const base = baseState()
      const provider = await openBoard(
        {
          [`GET ${proposalsUrl}`]: { body: [proposal()] },
          [`GET ${proposalUrl}`]: { body: proposal() },
          [`GET ${proposalUrl}/base`]: { bytes: base },
          ...responses,
        },
        `?proposal=${proposalId}`,
      )
      Y.applyUpdate(provider.document, base, provider)
      writeCell(getCells(provider.document), cell('db', 'a1', 'Хранилище'))
      act(() => provider.emitConnected())
      const review = await screen.findByRole('region', { name: 'Предложение «Добавить очередь»' })
      const draft = draftProvider()
      const draftDocument = (draft.configuration as { document: Y.Doc }).document
      // Changes that collab sends are not changes of the page.
      Y.applyUpdate(draftDocument, base, draft)
      const changed = new Y.Doc()
      Y.applyUpdate(changed, base)
      writeCell(getCells(changed), cell('queue', 'a2', 'Очередь'))
      writeCell(getCells(changed), cell('db', 'a1', 'PostgreSQL'))
      Y.applyUpdate(draftDocument, Y.encodeStateAsUpdate(changed), draft)
      act(() => draft.emitConnected('readonly'))
      return Object.assign(provider, { review, draft })
    }

    it('shows how many proposals are open and lists them, the open ones first', async () => {
      await openBoard({
        [`GET ${proposalsUrl}`]: {
          body: [proposal(), proposal({ id: 'p0', title: 'Убрать кэш', status: 'declined', decidedAt: '2026-10-01T10:00:00Z' })],
        },
      })

      await userEvent.click(await screen.findByRole('button', { name: 'Предложения (1)' }))

      const panel = screen.getByRole('complementary', { name: 'Предложения' })
      expect(within(within(panel).getByRole('region', { name: 'Открытые' })).getByRole('button')).toHaveTextContent(
        'Добавить очередь Боб · 5 минут назад',
      )
      expect(within(within(panel).getByRole('region', { name: 'Закрытые' })).getByRole('button')).toHaveTextContent(
        /Убрать кэш.*Отклонено/,
      )
    })

    it('makes a proposal, tells the others and goes to its draft', async () => {
      const provider = await openBoard({ [`POST ${proposalsUrl}`]: { status: 201, body: proposal() } })
      act(() => provider.emitConnected())

      await userEvent.click(await screen.findByRole('button', { name: 'Предложения' }))
      await userEvent.click(screen.getByRole('button', { name: 'Предложить изменения' }))
      await userEvent.type(screen.getByRole('textbox', { name: 'Название предложения' }), 'Добавить очередь')
      await userEvent.type(screen.getByRole('textbox', { name: 'Описание предложения' }), 'Между API и БД')
      await userEvent.click(screen.getByRole('button', { name: 'Создать' }))

      expect(await screen.findByText('Черновик предложения')).toBeInTheDocument()
      expect(provider.router.state.location.pathname).toBe(`/boards/${boardId}/proposals/${proposalId}`)
      const [[, init]] = requests(provider.fetchMock, 'POST', proposalsUrl)
      expect(JSON.parse(init!.body as string)).toEqual({ title: 'Добавить очередь', description: 'Между API и БД' })
      expect(provider.sentStateless).toEqual([PROPOSALS_CHANGED])
    })

    it('tells why no more proposals can be made', async () => {
      await openBoard({
        [`POST ${proposalsUrl}`]: { status: 409, body: { title: 'Proposal limit reached', limit: 3, scope: 'author' } },
      })

      await userEvent.click(await screen.findByRole('button', { name: 'Предложения' }))
      await userEvent.click(screen.getByRole('button', { name: 'Предложить изменения' }))
      await userEvent.type(screen.getByRole('textbox', { name: 'Название предложения' }), 'Ещё одно')
      await userEvent.click(screen.getByRole('button', { name: 'Создать' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Больше открытых предложений на этой доске нельзя: у вас их уже 3')
    })

    it('fetches the proposals again when another participant tells of a change', async () => {
      const provider = await openBoard()
      await waitFor(() => expect(requests(provider.fetchMock, 'GET', proposalsUrl)).toHaveLength(1))

      act(() => provider.emitStateless(PROPOSALS_CHANGED))

      await waitFor(() => expect(requests(provider.fetchMock, 'GET', proposalsUrl)).toHaveLength(2))
    })

    it('opens the review of a proposal from a link, in place of the board, and takes the request out of the address', async () => {
      const provider = await openReview()

      expect(provider.router.state.location.search).not.toContain('proposal')
      expect(screen.getByRole('complementary', { name: 'Предложения' })).toBeInTheDocument()
      expect(screen.queryByRole('complementary', { name: 'Фигуры' })).toBeNull()
      expect(provider.draft.configuration.name).toBe(`proposal:${proposalId}`)
      expect(within(provider.review).getByText('Между API и БД')).toBeInTheDocument()
    })

    it('shows what the proposal changes on its draft, and what the board changed since the proposal too', async () => {
      const { review } = await openReview()

      const list = await within(review).findByRole('complementary', { name: 'Изменения' })
      expect(within(list).getByText('Добавлено 1 · Изменено 1 · Удалено 0')).toBeInTheDocument()
      expect(within(list).getByText('Изменено и на доске: 1')).toBeInTheDocument()
      expect(within(list).getByRole('button', { name: /Изменено: PostgreSQL/ })).toHaveTextContent(
        'Изменено на доске после предложения',
      )
      expect(within(list).getByRole('button', { name: /Добавлено: Очередь/ })).not.toHaveTextContent('на доске')
      expect(within(review).getByTestId('diagram-canvas')).toHaveAttribute('data-read-only', 'true')
      expect(within(review).queryByRole('button', { name: 'Отозвать' })).toBeNull()
    })

    it('offers the migration of the schema from the board to the board with the proposal accepted', async () => {
      const provider = await openReview()
      const draftDocument = (provider.draft.configuration as { document: Y.Doc }).document
      act(() => {
        const jobs = cell('jobs', 'a3', 'jobs')
        writeCell(getCells(draftDocument), { ...jobs, style: { childLayout: 'stackLayout', dbVendor: 'mysql' } })
        writeCell(getCells(draftDocument), { ...cell('jobs-id', 'a0', 'id bigint PK'), parent: 'jobs' })
      })
      await within(provider.review).findByRole('complementary', { name: 'Изменения' })

      await userEvent.click(within(provider.review).getByRole('button', { name: 'Миграция SQL' }))

      const dialog = screen.getByRole('dialog', { name: 'Миграция SQL' })
      expect(dialog).toHaveTextContent('Из «текущая доска» в «доска с предложением «Добавить очередь»»')
      expect(within(dialog).getByRole('combobox', { name: 'СУБД' })).toHaveValue('mysql')
      const sql = within(dialog).getByRole('textbox', { name: 'Текст Архитектура — миграция.sql' })
      expect((sql as HTMLTextAreaElement).value).toContain('CREATE TABLE jobs (\n    id bigint NOT NULL,\n    PRIMARY KEY (id)\n);')
      // The board stays as it is until the proposal is accepted.
      expect(getCells(provider.document).has('jobs')).toBe(false)
    })

    it('accepts: keeps the board as a version, closes the proposal and merges it into the board for everybody', async () => {
      const provider = await openReview({
        [`POST ${proposalUrl}/accept`]: { body: proposal({ status: 'accepted', decidedBy: ALICE, decidedAt: '2026-10-01T10:00:00Z' }) },
      })
      const live = canvas.document!
      await within(provider.review).findByRole('complementary', { name: 'Изменения' })

      await userEvent.click(within(provider.review).getByRole('button', { name: 'Принять' }))
      const confirmation = screen.getByRole('alertdialog', { name: 'Принятие предложения' })
      expect(confirmation).toHaveTextContent('Где доску после предложения тоже изменили (1), останется вариант предложения')
      await userEvent.click(within(confirmation).getByRole('button', { name: 'Принять' }))

      await waitFor(() => expect(screen.queryByRole('region', { name: 'Предложение «Добавить очередь»' })).toBeNull())
      const [[, init]] = requests(provider.fetchMock, 'POST', `${proposalUrl}/accept`)
      // The version keeps the board as it was before: with the change of the board and without the proposal.
      const kept = new Y.Doc()
      Y.applyUpdate(kept, init!.body as Uint8Array)
      expect(getCells(kept).get('db')!.get('value')).toBe('Хранилище')
      expect(getCells(kept).has('queue')).toBe(false)
      const values = Object.fromEntries([...getCells(live).entries()].map(([id, entry]) => [id, entry.get('value')]))
      expect(values).toMatchObject({ api: 'API', db: 'PostgreSQL', queue: 'Очередь' })
      expect(provider.sentStateless).toContain(PROPOSALS_CHANGED)
      expect(provider.draft.sentStateless).toEqual([PROPOSALS_CHANGED])
    })

    it('accepts only once the board is synced over a connection that may edit it', async () => {
      const provider = await openReview()
      act(() => provider.emitStatus('disconnected'))

      expect(within(provider.review).getByRole('button', { name: 'Принять' })).toBeDisabled()
      expect(within(provider.review).getByRole('button', { name: 'Принять' })).toHaveAccessibleDescription(
        'Принять можно после синхронизации',
      )
    })

    it('declines with a comment to the author, and leaves the board as it is', async () => {
      const declined = proposal({ status: 'declined', decidedBy: ALICE, decidedAt: new Date().toISOString(), comment: 'Очередь уже есть' })
      const provider = await openReview({
        [`GET ${proposalUrl}`]: [{ body: proposal() }, { body: declined }],
        [`POST ${proposalUrl}/decline`]: { body: declined },
      })
      const before = Y.encodeStateVector(canvas.document!)

      await userEvent.click(within(provider.review).getByRole('button', { name: 'Отклонить' }))
      await userEvent.type(screen.getByRole('textbox', { name: 'Комментарий автору' }), 'Очередь уже есть')
      await userEvent.click(within(screen.getByRole('form', { name: 'Отклонение предложения' })).getByRole('button', { name: 'Отклонить' }))

      expect(await within(provider.review).findByText('Комментарий: Очередь уже есть')).toBeInTheDocument()
      expect(within(provider.review).getByText(/Отклонено: Алиса/)).toBeInTheDocument()
      expect(within(provider.review).queryByRole('button', { name: 'Принять' })).toBeNull()
      const [[, init]] = requests(provider.fetchMock, 'POST', `${proposalUrl}/decline`)
      expect(JSON.parse(init!.body as string)).toEqual({ comment: 'Очередь уже есть' })
      expect(Y.encodeStateVector(canvas.document!)).toEqual(before)
    })

    it('lets the author of a proposal who views the board edit its draft and withdraw it, but not accept it', async () => {
      const withdrawn = proposal({ status: 'withdrawn', decidedBy: BOB, decidedAt: new Date().toISOString() })
      const provider = await openReview({
        'GET /api/me': { body: { ...ALICE, id: BOB.id, name: BOB.name } },
        [`GET /api/boards/${boardId}`]: { body: boardToView },
        [`GET ${proposalUrl}`]: [{ body: proposal() }, { body: withdrawn }],
        [`POST ${proposalUrl}/withdraw`]: { body: withdrawn },
      })

      expect(within(provider.review).getByRole('link', { name: 'Править черновик' })).toHaveAttribute(
        'href',
        `/boards/${boardId}/proposals/${proposalId}`,
      )
      expect(within(provider.review).queryByRole('button', { name: 'Принять' })).toBeNull()
      await userEvent.click(within(provider.review).getByRole('button', { name: 'Отозвать' }))
      await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Отзыв предложения' })).getByRole('button', { name: 'Отозвать' }))

      expect(await within(provider.review).findByText(/Отозвано: Боб/)).toBeInTheDocument()
      expect(within(provider.review).getByRole('link', { name: 'Открыть черновик' })).toBeInTheDocument()
    })
  })

  describe('statuses of elements', () => {
    const bob = { id: 'bob', name: 'Боб' }
    const reviewUrl = `${boardUrl}/review-requests`
    const shownPage = () => screen.getByTestId('diagram-canvas').dataset.page
    const statuses = () => screen.getByRole('dialog', { name: 'Статусы элементов' })
    /** «API» on the first page and the table «orders» on the page «Данные», both waiting for a review. */
    function fill(document: Y.Doc) {
      document.transact(() => {
        writePage(document, 'page-2', { name: 'Данные', order: 'a5' })
        writeCell(getCells(document), shapeData('api', 'a0', { value: 'API' }))
        writeCell(getCells(document, 'page-2'), shapeData('orders', 'a0', { value: 'orders', style: { childLayout: 'stackLayout' } }))
        writeStatus(getCells(document).get('api')!, 'review', bob, Date.now())
        writeStatus(getCells(document, 'page-2').get('orders')!, 'review', bob, Date.now())
      })
    }
    /** Right-clicks a shape on the canvas and chooses a status in the menu. */
    async function chooseStatus(editor: FakeEditor, name: string) {
      act(() => editor.rightClick({ x: 10, y: 10, point: { x: 0, y: 0 }, target: 'shape', cellId: 'api' }))
      await userEvent.click(screen.getByRole('menuitemradio', { name }))
    }

    it('shows the statuses of the page over the canvas and goes to an element to review on another page', async () => {
      const provider = await openBoard()
      act(() => provider.emitSynced())
      act(() => fill(provider.document))
      act(() => canvas.editor!.placeCell('api', { x: 100, y: 50, width: 120, height: 60 }))

      expect(screen.getByRole('img', { name: /^Нужно ревью — Боб, / })).toHaveAttribute('data-cell', 'api')
      await userEvent.click(await screen.findByRole('button', { name: '2 на ревью' }))
      await userEvent.click(within(statuses()).getByRole('button', { name: /orders/ }))

      await waitFor(() => expect(shownPage()).toBe('page-2'))
      await waitFor(() => expect(canvas.editor!.revealCell).toHaveBeenCalledWith('orders'))
      expect(provider.router.state.location.search).toBe('?page=page-2')
      expect(screen.queryByRole('dialog', { name: 'Статусы элементов' })).toBeNull()
    })

    it('asks the owner to review what a participant who is not the owner marks «Нужно ревью», once per change', async () => {
      const provider = await openBoard({ [`GET ${boardUrl}`]: { body: boardOfAnother }, [`POST ${reviewUrl}`]: { status: 204 } })
      act(() => provider.emitSynced())
      const editor = canvas.editor!
      act(() => editor.setState({ status: { value: null, mixed: false } }))
      vi.mocked(editor.setStatus).mockReturnValue(['db', 'api'])

      await chooseStatus(editor, 'Нужно ревью')

      expect(editor.setStatus).toHaveBeenCalledWith('review')
      const sent = requests(provider.fetchMock, 'POST', reviewUrl)
      expect(sent).toHaveLength(1)
      expect(JSON.parse(String(sent[0]![1]!.body))).toEqual({ pageId: DEFAULT_PAGE_ID, cellId: 'db' })

      // Another status, or «Нужно ревью» that changes nothing, asks nobody.
      await chooseStatus(editor, 'Готово')
      vi.mocked(editor.setStatus).mockReturnValue([])
      await chooseStatus(editor, 'Нужно ревью')
      expect(requests(provider.fetchMock, 'POST', reviewUrl)).toHaveLength(1)
    })

    it('keeps the status quietly when the request for a review fails', async () => {
      const provider = await openBoard({ [`GET ${boardUrl}`]: { body: boardOfAnother }, [`POST ${reviewUrl}`]: { status: 429 } })
      act(() => provider.emitSynced())
      const editor = canvas.editor!
      act(() => editor.setState({ status: { value: null, mixed: false } }))
      vi.mocked(editor.setStatus).mockReturnValue(['api'])

      await chooseStatus(editor, 'Нужно ревью')

      await waitFor(() => expect(requests(provider.fetchMock, 'POST', reviewUrl)).toHaveLength(1))
      expect(editor.undo).not.toHaveBeenCalled()
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('asks nobody when the owner marks «Нужно ревью»', async () => {
      const provider = await openBoard()
      act(() => provider.emitSynced())
      const editor = canvas.editor!
      act(() => editor.setState({ status: { value: null, mixed: false } }))
      vi.mocked(editor.setStatus).mockReturnValue(['api'])

      await chooseStatus(editor, 'Нужно ревью')

      expect(editor.setStatus).toHaveBeenCalledWith('review')
      expect(requests(provider.fetchMock, 'POST', reviewUrl)).toHaveLength(0)
    })

    it('goes to the element of a link once the board is synced, also on a page the local copy lacks', async () => {
      // An earlier visit left a copy of the board from before the page of the element was added.
      const stored = new Y.Doc()
      const persistence = openLocalCopy(ALICE.id, boardId, board.title, stored)!
      await persistence.whenSynced
      initializeDocument(stored)
      await persistence.destroy()
      const provider = await openBoard({}, '?page=page-2&cell=orders')

      // IndexedDB answers asynchronously, slower when the tests run in parallel.
      expect(await screen.findByTestId('diagram-canvas', undefined, { timeout: 5_000 })).toBeInTheDocument()
      expect(canvas.editor!.revealCell).not.toHaveBeenCalled()

      act(() => {
        fill(provider.document)
        provider.emitConnected()
      })

      await waitFor(() => expect(shownPage()).toBe('page-2'))
      await waitFor(() => expect(canvas.editor!.revealCell).toHaveBeenCalledWith('orders'))
      expect(provider.router.state.location.search).toBe('?page=page-2')
    })

    it('opens the page of the element of a link when the element is gone', async () => {
      const provider = await openBoard({}, '?page=page-2&cell=gone')
      act(() => {
        // The document of the board as collab gives it, with its first page.
        initializeDocument(provider.document)
        fill(provider.document)
        provider.emitSynced()
      })

      await waitFor(() => expect(provider.router.state.location.search).toBe('?page=page-2'))
      await waitFor(() => expect(shownPage()).toBe('page-2'))
      expect(canvas.editor!.revealCell).toHaveBeenCalledWith('gone')
    })
  })

  describe('local copy', () => {
    /** Keeps a copy of the board for Алиса in the browser, as an earlier tab of hers left it. */
    async function storeCopy(build: (document: Y.Doc) => void, { pending = false } = {}) {
      const document = new Y.Doc()
      const persistence = openLocalCopy(ALICE.id, boardId, board.title, document)!
      await persistence.whenSynced
      build(document)
      await persistence.destroy()
      if (pending) setUnsentEdits(ALICE.id, boardId, true)
    }
    /** A board with one page named `name`. */
    const onePage = (name: string) => (document: Y.Doc) => {
      initializeDocument(document)
      renamePage(document, DEFAULT_PAGE_ID, name)
    }
    const tabNames = () => within(screen.getByRole('tablist', { name: 'Страницы' })).getAllByRole('tab').map((tab) => tab.textContent)
    const documentOf = (provider: FakeHocuspocusProvider) => (provider.configuration as { document: Y.Doc }).document
    const pending = () => findLocalCopy(ALICE.id, boardId)?.pending
    /** Stubs the download of a file and returns the files the page saves. */
    function captureDownloads() {
      const files: { name: string; blob: Blob }[] = []
      let blob: Blob | null = null
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn((created: Blob) => ((blob = created), 'blob:test')), revokeObjectURL: vi.fn() }))
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        files.push({ name: this.download, blob: blob! })
      })
      return files
    }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('shows the board from the copy at once, before collab has synced it', async () => {
      await storeCopy(onePage('Из копии'))

      await openBoard()

      // IndexedDB answers asynchronously, slower when the tests run in parallel.
      expect(await screen.findByTestId('diagram-canvas', undefined, { timeout: 5_000 })).toBeInTheDocument()
      expect(tabNames()).toEqual(['Из копии'])
      expect(screen.getByRole('status')).toHaveTextContent('Подключение')
    })

    it('keeps the edits made without a connection on the device and sends them once a connection that may edit syncs', async () => {
      const provider = await openBoard()
      // The page sets up the board, and collab confirms it.
      act(() => provider.emitConnected())
      act(() => provider.emitUnsyncedChanges(0))
      expect(pending()).toBe(false)
      act(() => provider.emitStatus('disconnected'))
      expect(screen.getByRole('status')).toHaveTextContent('Нет связи')
      expect(screen.getByRole('note')).toHaveTextContent(/^Нет связи — правки сохраняются на этом устройстве$/)

      await userEvent.click(screen.getByRole('button', { name: 'Добавить страницу' }))

      expect(screen.getByRole('note')).toHaveTextContent(
        /^Нет связи — правки сохраняются на этом устройстве · Не отправлено: есть правки$/,
      )
      expect(listPages(provider.document)).toHaveLength(1)
      expect(pending()).toBe(true)
      expect(listPages(await loadLocalCopy(ALICE.id, boardId))).toHaveLength(2)

      // The edits wait for the state of the board, and then for collab to confirm them.
      act(() => {
        provider.emitStatus('connected')
        provider.emitUnsyncedChanges(1)
        provider.emitAuthenticated()
      })
      expect(listPages(provider.document)).toHaveLength(1)
      act(() => provider.emitSynced())
      expect(listPages(provider.document)).toHaveLength(2)
      expect(pending()).toBe(true)
      act(() => provider.emitUnsyncedChanges(0))
      expect(pending()).toBe(false)
      expect(screen.getByRole('status')).toHaveTextContent('Синхронизировано')
      expect(screen.queryByRole('note')).toBeNull()
    })

    it('puts the edits made without a connection on top of a version that the owner restored meanwhile', async () => {
      const provider = await openBoard()
      act(() => provider.emitConnected())
      act(() => provider.emitUnsyncedChanges(0))
      const version = new Y.Doc()
      Y.applyUpdate(version, Y.encodeStateAsUpdate(provider.document))
      act(() => {
        getCells(provider.document).set('later', new Y.Map<unknown>(Object.entries({ kind: 'vertex', parent: '1', order: 'a1' })))
      })
      act(() => provider.emitStatus('disconnected'))
      await userEvent.click(screen.getByRole('button', { name: 'Добавить страницу' }))

      act(() => restoreDocument(provider.document, version))
      act(() => provider.emitConnected())

      expect(getCells(provider.document).has('later')).toBe(false)
      expect(listPages(provider.document)).toHaveLength(2)
      expect(tabNames()).toEqual(['Страница 1', 'Страница 2'])
    })

    it('sends the edits that an earlier tab kept on the device once the board is opened again', async () => {
      await storeCopy(onePage('Без связи'), { pending: true })

      const provider = await openBoard()

      await waitFor(() => expect(tabNames()).toEqual(['Без связи']))
      expect(screen.getByRole('status')).toHaveTextContent('Подключение')
      expect(screen.getByRole('note')).toHaveTextContent(/^Не отправлено: есть правки$/)
      act(() => {
        provider.emitUnsyncedChanges(1)
        provider.emitConnected()
      })
      expect(listPages(provider.document).map((page) => page.name)).toEqual(['Без связи'])
      act(() => provider.emitUnsyncedChanges(0))
      expect(pending()).toBe(false)
    })

    it('closes the socket when the browser loses the network and connects at once when it is back', async () => {
      const provider = await openBoard()
      act(() => provider.emitConnected())

      act(() => {
        window.dispatchEvent(new Event('offline'))
      })
      expect(provider.socketClosed).toBe(1)
      act(() => provider.emitStatus('disconnected'))
      expect(screen.getByRole('status')).toHaveTextContent('Нет связи')
      expect(screen.getByRole('note')).toHaveTextContent('Нет связи — правки сохраняются на этом устройстве')

      act(() => {
        window.dispatchEvent(new Event('online'))
      })
      expect(provider.connects).toBe(1)
    })

    it('does not connect again when the network is back for a board that is gone', async () => {
      const provider = await openBoard()
      act(() => provider.emitClose('board-not-found'))

      act(() => {
        window.dispatchEvent(new Event('online'))
      })

      expect(provider.connects).toBe(0)
      expect(provider.disconnected).toBe(true)
    })

    it('keeps the board of a participant who may only view for reading, and sends nothing from it', async () => {
      await storeCopy(onePage('Из копии'))
      const provider = await openBoard({ [`GET ${boardUrl}`]: { body: boardToView } })
      const updates = vi.fn()
      provider.document.on('update', updates)

      await waitFor(() => expect(tabNames()).toEqual(['Из копии']))
      act(() => provider.emitConnected('readonly'))
      act(() => provider.emitStatus('disconnected'))

      expect(updates).not.toHaveBeenCalled()
      expect(screen.getByRole('status')).toHaveTextContent('Нет связи')
      // Nothing is kept for later: a participant who may only view edits nothing.
      expect(screen.queryByRole('note')).toBeNull()
    })

    it('shows a participant who may now only view the board without the unsent edits of their copy, to download or delete', async () => {
      await storeCopy(onePage('Без связи'), { pending: true })
      const files = captureDownloads()
      const provider = await openBoard({ [`GET ${boardUrl}`]: { body: boardToView } })
      act(() => {
        initializeDocument(provider.document)
        provider.emitConnected('readonly')
      })

      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent('Правки, сделанные без связи, не отправлены: у вас больше нет права правки')
      expect(tabNames()).toEqual(['Страница 1'])

      await userEvent.click(within(alert).getByRole('button', { name: 'Скачать копию (.drawio)' }))
      await waitFor(() => expect(files).toHaveLength(1))
      expect(files[0]!.name).toBe('Архитектура.drawio')
      expect(await files[0]!.blob.text()).toContain('name="Без связи"')

      await userEvent.click(within(alert).getByRole('button', { name: 'Удалить копию с устройства' }))
      await userEvent.click(within(alert).getByRole('button', { name: 'Удалить' }))

      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
      // The page keeps the board in a new copy, for reading.
      const next = FakeHocuspocusProvider.latest()
      expect(next).not.toBe(provider)
      expect(findLocalCopy(ALICE.id, boardId)).toMatchObject({ pending: false })
    })

    it('sets the copy aside without sending its edits when the connection turns out to be read-only', async () => {
      await storeCopy(onePage('Без связи'), { pending: true })
      const provider = await openBoard({ [`GET ${boardUrl}`]: [{ body: boardOfAnother }, { body: boardToView }] })
      await waitFor(() => expect(tabNames()).toEqual(['Без связи']))
      const updates = vi.fn()
      provider.document.on('update', updates)

      act(() => provider.emitConnected('readonly'))

      expect(updates).not.toHaveBeenCalled()
      const next = FakeHocuspocusProvider.latest()
      expect(next).not.toBe(provider)
      expect(provider.destroyed).toBe(true)
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Правки, сделанные без связи, не отправлены: у вас больше нет права правки',
      )
      act(() => {
        initializeDocument(documentOf(next))
        next.emitConnected('readonly')
      })
      expect(tabNames()).toEqual(['Страница 1'])
      expect(await screen.findByText('Только просмотр')).toBeInTheDocument()
      expect(pending()).toBe(true)
    })

    it('sends the set-aside copy once the role gives editing again, e.g. when the owner answers a request for it', async () => {
      await storeCopy(onePage('Без связи'), { pending: true })
      const provider = await openBoard({ [`GET ${boardUrl}`]: [{ body: boardToView }, { body: boardOfAnother }] })
      act(() => {
        initializeDocument(provider.document)
        provider.emitConnected('readonly')
      })
      expect(screen.getByRole('alert')).toHaveTextContent('Правки, сделанные без связи, не отправлены: у вас больше нет права правки')

      // The owner gave editing: collab closes the connection, which comes back with it, and the page fetches the role.
      act(() => provider.emitClose('access-changed'))
      act(() => provider.emitConnected())

      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
      expect(screen.queryByText('Только просмотр')).toBeNull()
      const next = FakeHocuspocusProvider.latest()
      expect(next).not.toBe(provider)
      expect(provider.destroyed).toBe(true)
      await waitFor(() => expect(tabNames()).toEqual(['Без связи']))
      act(() => next.emitConnected())
      expect(listPages(documentOf(next)).map((page) => page.name)).toEqual(['Без связи'])
      act(() => next.emitUnsyncedChanges(0))
      expect(pending()).toBe(false)
    })

    it('offers the unsent edits of the copy when the board gives no access any more, and deletes a copy without them', async () => {
      await storeCopy(onePage('Без связи'), { pending: true })
      mockFetch({ 'GET /api/me': { body: ALICE }, [`GET ${boardUrl}`]: { status: 403 } })
      const first = renderRoutes(routes, `/boards/${boardId}`)

      expect(await screen.findByRole('alert')).toHaveTextContent('Нет доступа')
      expect(screen.getByText('Правки, сделанные без связи, не отправлены: у вас больше нет права правки')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Скачать копию (.drawio)' })).toBeInTheDocument()
      first.unmount()

      setUnsentEdits(ALICE.id, boardId, false)
      renderRoutes(routes, `/boards/${boardId}`)

      expect(await screen.findByRole('alert')).toHaveTextContent('Нет доступа')
      await waitFor(() => expect(findLocalCopy(ALICE.id, boardId)).toBeNull())
      expect(screen.queryByRole('button', { name: 'Скачать копию (.drawio)' })).toBeNull()
    })

    it('offers the unsent edits of the copy when collab rejects a participant whom the board no longer gives access', async () => {
      const provider = await openBoard({ [`GET ${boardUrl}`]: [{ body: boardOfAnother }, { status: 403 }] })
      act(() => provider.emitConnected())
      act(() => provider.emitStatus('disconnected'))
      await userEvent.click(screen.getByRole('button', { name: 'Добавить страницу' }))

      act(() => provider.emitAuthenticationFailed('no-access'))

      expect(await screen.findByText('Правки, сделанные без связи, не отправлены: у вас больше нет права правки')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('Нет доступа')
      expect(listPages(provider.document)).toHaveLength(1)
    })

    it('offers the unsent edits of the copy of a deleted board, and deletes a copy without them', async () => {
      const provider = await openBoard()
      act(() => provider.emitConnected())
      act(() => provider.emitStatus('disconnected'))
      await userEvent.click(screen.getByRole('button', { name: 'Добавить страницу' }))

      act(() => provider.emitClose('board-not-found'))

      expect(screen.getByRole('alert')).toHaveTextContent('Доска не найдена')
      const notice = await screen.findByText('Неотправленные правки остались в копии доски на этом устройстве')
      await userEvent.click(screen.getByRole('button', { name: 'Удалить копию с устройства' }))
      await userEvent.click(screen.getByRole('button', { name: 'Удалить' }))
      await waitFor(() => expect(notice).not.toBeInTheDocument())
      expect(findLocalCopy(ALICE.id, boardId)).toBeNull()
    })

    it('deletes the copy without unsent edits of a board that collab no longer has', async () => {
      const provider = await openBoard()
      act(() => provider.emitConnected())
      act(() => provider.emitUnsyncedChanges(0))

      act(() => provider.emitClose('board-not-found'))

      expect(screen.getByRole('alert')).toHaveTextContent('Доска не найдена')
      await waitFor(() => expect(findLocalCopy(ALICE.id, boardId)).toBeNull())
    })

    it('keeps the copy with a change too large for the board on the device, and offers it with the warning', async () => {
      const provider = await openBoard()
      act(() => provider.emitConnected())
      await userEvent.click(screen.getByRole('button', { name: 'Добавить страницу' }))

      act(() => provider.emitClose('document-too-large'))

      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent('Доска достигла предельного размера, последнее изменение не сохранено')
      expect(alert).toHaveTextContent('Неотправленные правки остались в копии доски на этом устройстве')
      const next = FakeHocuspocusProvider.latest()
      expect(next).not.toBe(provider)
      act(() => next.emitConnected())
      expect(tabNames()).toEqual(['Страница 1'])
      expect(listPages(await loadLocalCopy(ALICE.id, boardId))).toHaveLength(2)

      await userEvent.click(within(alert).getByRole('button', { name: 'Удалить копию с устройства' }))
      await userEvent.click(within(alert).getByRole('button', { name: 'Удалить' }))

      await waitFor(() => expect(within(alert).queryByText(/Неотправленные правки/)).toBeNull())
      expect(alert).toHaveTextContent('Доска достигла предельного размера')
      expect(FakeHocuspocusProvider.latest()).not.toBe(next)
    })
  })
})
