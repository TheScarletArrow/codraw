import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import type { Board } from '../api/boards.ts'
import type { Proposal } from '../api/proposals.ts'
import { PROPOSALS_CHANGED } from '../board/messages.ts'
import { getPages, initializeDocument } from '../diagram/model.ts'
import type { FakeEditor } from '../test/fakeEditor.ts'
import { FakeHocuspocusProvider } from '../test/fakeProvider.ts'
import { ALICE, mockFetch, renderRoutes, type MockResponse } from '../test/render.tsx'
import { ProposalPage } from './ProposalPage.tsx'

vi.mock('@hocuspocus/provider', async () => ({
  HocuspocusProvider: (await import('../test/fakeProvider.ts')).FakeHocuspocusProvider,
}))
// maxGraph needs real SVG layout; the stand-in hands a fake editor to the page, like the real canvas does.
vi.mock('../diagram/DiagramCanvas.tsx', async () => {
  const { useEffect } = await import('react')
  const { createFakeEditor } = await import('../test/fakeEditor.ts')
  return {
    DiagramCanvas: ({
      pageId,
      readOnly = false,
      collaboration = true,
      onEditor,
    }: {
      pageId: string
      readOnly?: boolean
      collaboration?: boolean
      onEditor: (editor: FakeEditor | null) => void
    }) => {
      useEffect(() => {
        onEditor(createFakeEditor({ pageId, readOnly }))
        return () => onEditor(null)
      }, [pageId, readOnly, onEditor])
      return (
        <div data-testid="diagram-canvas" data-page={pageId} data-read-only={readOnly} data-collaboration={collaboration} />
      )
    },
  }
})

const boardId = '0199a000-0000-7000-8000-000000000001'
const proposalId = '0199a000-0000-7000-8000-000000000301'
const BOB = { id: '0199a000-0000-7000-8000-0000000000b1', name: 'Боб', avatarUrl: null }
const board: Board = {
  id: boardId,
  title: 'Архитектура',
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
  linkAccess: 'view',
  owner: { id: BOB.id, name: BOB.name, avatarUrl: null },
  role: 'viewer',
}
const proposal = (changes: Partial<Proposal> = {}): Proposal => ({
  id: proposalId,
  boardId,
  title: 'Добавить очередь',
  description: null,
  status: 'open',
  author: { id: ALICE.id, name: ALICE.name, avatarUrl: null },
  createdAt: '2026-10-01T10:00:00Z',
  decidedAt: null,
  decidedBy: null,
  comment: null,
  ...changes,
})
const proposalUrl = `/api/boards/${boardId}/proposals/${proposalId}`
const routes = [
  { path: '/boards/:boardId', element: <p>Доска</p> },
  { path: '/boards/:boardId/proposals/:proposalId', element: <ProposalPage /> },
]

/** Opens the draft of the proposal of Алиса, who views the board of Боб, unless the responses say otherwise. */
async function openDraft(responses: Record<string, MockResponse | MockResponse[]> = {}) {
  const fetchMock = mockFetch({
    'GET /api/me': { body: ALICE },
    [`GET /api/boards/${boardId}`]: { body: board },
    [`GET ${proposalUrl}`]: { body: proposal() },
    [`GET /api/boards/${boardId}/proposals`]: { body: [proposal()] },
    ...responses,
  })
  const { router } = renderRoutes(routes, `/boards/${boardId}/proposals/${proposalId}`)
  await screen.findByRole('heading', { name: 'Добавить очередь' })
  const provider = FakeHocuspocusProvider.latest()
  const document = (provider.configuration as { document: Y.Doc }).document
  return Object.assign(provider, { fetchMock, router, document })
}

describe('ProposalPage', () => {
  beforeEach(() => {
    FakeHocuspocusProvider.instances = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('connects to the draft of the proposal and lets its author edit it with the tools of the board', async () => {
    const provider = await openDraft()
    expect(provider.configuration.name).toBe(`proposal:${proposalId}`)

    act(() => provider.emitConnected('read-write'))

    expect(await screen.findByTestId('diagram-canvas')).toHaveAttribute('data-read-only', 'false')
    expect(screen.getByRole('complementary', { name: 'Фигуры' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Синхронизировано')
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('Предложение «Добавить очередь»: правки не попадают на доску, пока их не примут')
    expect(within(note).getByRole('link', { name: 'К доске' })).toHaveAttribute('href', `/boards/${boardId}`)
    expect(within(note).getByRole('button', { name: 'Отозвать' })).toBeInTheDocument()
    // The draft of a board that had no pages gets its first page from its author.
    expect(getPages(provider.document).size).toBe(1)
  })

  it('offers neither the laser pointer nor the comment tool on the draft, which nobody else is on', async () => {
    const provider = await openDraft()
    act(() => provider.emitConnected('read-write'))

    // K and C turn nothing on.
    expect(await screen.findByTestId('diagram-canvas')).toHaveAttribute('data-collaboration', 'false')
    const toolbar = screen.getByRole('toolbar', { name: 'Инструменты' })
    expect(within(toolbar).getByRole('button', { name: 'Отменить' })).toBeInTheDocument()
    expect(within(toolbar).queryByRole('button', { name: 'Указка' })).toBeNull()
    expect(within(toolbar).queryByRole('button', { name: 'Комментарий' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Горячие клавиши' }))
    const help = await screen.findByRole('dialog', { name: 'Горячие клавиши' })
    expect(within(help).getByRole('region', { name: 'Правка' })).toBeInTheDocument()
    expect(within(help).queryByRole('region', { name: 'Совместная работа' })).toBeNull()
  })

  it('shows the draft of another user for viewing only, with the way to its review on the board', async () => {
    const provider = await openDraft({
      [`GET /api/boards/${boardId}`]: { body: { ...board, role: 'owner' } },
      [`GET ${proposalUrl}`]: { body: proposal({ author: BOB }) },
    })
    // The draft as collab has it, with the first page its author set up.
    const stored = new Y.Doc()
    initializeDocument(stored)
    Y.applyUpdate(provider.document, Y.encodeStateAsUpdate(stored), provider)

    act(() => provider.emitConnected('readonly'))

    expect(await screen.findByTestId('diagram-canvas')).toHaveAttribute('data-read-only', 'true')
    expect(screen.queryByRole('complementary', { name: 'Фигуры' })).toBeNull()
    expect(screen.getByText('Только просмотр')).toBeInTheDocument()
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('Черновик предложения «Добавить очередь» к доске «Архитектура» от Боб — только для просмотра')
    expect(within(note).getByRole('link', { name: 'К доске' })).toHaveAttribute(
      'href',
      `/boards/${boardId}?proposal=${proposalId}`,
    )
    expect(within(note).queryByRole('button', { name: 'Отозвать' })).toBeNull()
  })

  it('withdraws the proposal and tells the others on the draft', async () => {
    const withdrawn = proposal({ status: 'withdrawn', decidedBy: { id: ALICE.id, name: ALICE.name, avatarUrl: null } })
    const provider = await openDraft({
      [`GET ${proposalUrl}`]: [{ body: proposal() }, { body: withdrawn }],
      [`POST ${proposalUrl}/withdraw`]: { body: withdrawn },
    })
    act(() => provider.emitConnected('read-write'))

    await userEvent.click(within(screen.getByRole('note')).getByRole('button', { name: 'Отозвать' }))
    await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Отзыв предложения' })).getByRole('button', { name: 'Отозвать' }))

    await waitFor(() =>
      expect(screen.getByRole('note')).toHaveTextContent('Предложение «Добавить очередь» — отозвано: черновик только для просмотра'),
    )
    expect(provider.sentStateless).toEqual([PROPOSALS_CHANGED])
  })

  it('fetches the proposal again when collab tells that it changed or closes the connection for another access', async () => {
    const provider = await openDraft()
    act(() => provider.emitConnected('read-write'))
    const fetched = () => provider.fetchMock.mock.calls.filter(([input]) => input.toString() === proposalUrl).length
    const before = fetched()

    act(() => provider.emitStateless(PROPOSALS_CHANGED))
    await waitFor(() => expect(fetched()).toBe(before + 1))

    act(() => provider.emitClose('access-changed'))
    await waitFor(() => expect(fetched()).toBe(before + 2))
  })

  it('starts again with the draft as collab has it when a read-only connection would not take the changes of the page', async () => {
    const provider = await openDraft()
    act(() => provider.emitConnected('read-write'))
    await screen.findByTestId('diagram-canvas')
    act(() => provider.document.getMap('meta').set('touched', true))

    act(() => provider.emitAuthenticated('readonly'))

    const next = FakeHocuspocusProvider.latest()
    expect(next).not.toBe(provider)
    expect(provider.destroyed).toBe(true)
  })

  it('tells that the proposal is gone', async () => {
    const provider = await openDraft()

    act(() => provider.emitAuthenticationFailed('proposal-not-found'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Предложение не найдено')
  })

  it('tells that a change made the draft too large and starts again without it', async () => {
    const provider = await openDraft()
    act(() => provider.emitConnected('read-write'))

    act(() => provider.emitClose('document-too-large'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Черновик достиг предельного размера')
    expect(FakeHocuspocusProvider.latest()).not.toBe(provider)
  })

  it('tells that the proposal is not there for a user who may not see it', async () => {
    mockFetch({
      'GET /api/me': { body: ALICE },
      [`GET /api/boards/${boardId}`]: { body: board },
      [`GET ${proposalUrl}`]: { status: 404 },
    })
    renderRoutes(routes, `/boards/${boardId}/proposals/${proposalId}`)

    expect(await screen.findByRole('alert')).toHaveTextContent('Предложение не найдено')
  })
})
