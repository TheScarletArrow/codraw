import { focusManager, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Navigate } from 'react-router'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { isUnauthorized } from '../api/http.ts'
import { recheckSession, useCurrentUser } from '../auth/session.ts'
import { orderBetween, writePage } from '../diagram/model.ts'
import type { FakeEditor } from '../test/fakeEditor.ts'
import { ALICE, mockFetch, renderRoutes, type MockResponse } from '../test/render.tsx'
import { PublicBoardPage } from './PublicBoardPage.tsx'

// maxGraph needs real SVG layout; the stand-in hands a fake editor to the page, like the real canvas does, and counts the
// canvases created.
const canvas = vi.hoisted(() => ({ editor: null as FakeEditor | null, created: 0 }))
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
        canvas.editor = createFakeEditor({ pageId, readOnly })
        canvas.created++
        onEditor(canvas.editor)
        return () => onEditor(null)
      }, [pageId, readOnly, onEditor])
      return (
        <div data-testid="diagram-canvas" data-page={pageId} data-read-only={readOnly} data-collaboration={collaboration} />
      )
    },
  }
})

const boardId = '0199a000-0000-7000-8000-000000000001'
const boardUrl = `/api/public/boards/${boardId}`
const publicBoard = { id: boardId, title: 'Архитектура', updatedAt: '2026-10-01T10:00:00Z' }

/** Adds the pages to the document after those it has, and returns its whole state. */
function addPages(doc: Y.Doc, pages: { id: string; name: string }[]): Uint8Array {
  doc.transact(() => {
    for (const page of pages) {
      const last = Array.from(doc.getMap<Y.Map<unknown>>('pages').values(), (entry) => entry.get('order') as string)
        .sort()
        .at(-1)
      writePage(doc, page.id, { name: page.name, order: orderBetween(last ?? null, null) })
    }
  })
  return Y.encodeStateAsUpdate(doc)
}

const twoPages = () =>
  addPages(new Y.Doc(), [
    { id: 'page-1', name: 'Контекст' },
    { id: 'page-2', name: 'Контейнеры' },
  ])

function renderPage(responses: Record<string, MockResponse | MockResponse[]>, path = `/view/${boardId}`) {
  const fetchMock = mockFetch({ 'GET /api/me': { status: 401 }, ...responses })
  const result = renderRoutes(
    [
      { path: '/view/:boardId', element: <PublicBoardPage /> },
      { path: '/login', element: <p>Страница входа</p> },
      { path: '/boards/:boardId', element: <p>Страница доски</p> },
    ],
    path,
  )
  return { fetchMock, ...result }
}

const shownCanvas = () => screen.findByTestId('diagram-canvas')

describe('PublicBoardPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    canvas.created = 0
  })

  it('shows the pages of the board read-only, without the tools of a participant, and lets the reader go to another', async () => {
    const { fetchMock, router } = renderPage({
      [`GET ${boardUrl}`]: { body: publicBoard },
      [`GET ${boardUrl}/document`]: { bytes: twoPages() },
    })

    expect(await screen.findByRole('heading', { name: 'Архитектура' })).toBeInTheDocument()
    expect(screen.getByText('Только просмотр')).toBeInTheDocument()
    const shown = await shownCanvas()
    expect(shown).toHaveAttribute('data-page', 'page-1')
    expect(shown).toHaveAttribute('data-read-only', 'true')
    expect(shown).toHaveAttribute('data-collaboration', 'false')
    expect(screen.getByRole('button', { name: 'Увеличить' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Комментарий' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Добавить страницу' })).toBeNull()

    await userEvent.click(screen.getByRole('tab', { name: 'Контейнеры' }))

    await waitFor(() => expect(screen.getByTestId('diagram-canvas')).toHaveAttribute('data-page', 'page-2'))
    expect(router.state.location.search).toBe('?page=page-2')
    // Nothing of a participant: no collab token, no presence, no comments.
    expect(fetchMock.mock.calls.map(([input]) => input.toString()).sort()).toEqual(
      ['/api/me', boardUrl, `${boardUrl}/document`].sort(),
    )
  })

  it('sends a report of the reader to the administrators', async () => {
    const { fetchMock } = renderPage({
      [`GET ${boardUrl}`]: { body: publicBoard },
      [`GET ${boardUrl}/document`]: { bytes: twoPages() },
      [`POST ${boardUrl}/reports`]: { status: 204 },
    })
    await shownCanvas()

    await userEvent.click(screen.getByRole('button', { name: 'Пожаловаться' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Незаконное содержимое' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Что не так' }), '  Чужие персональные данные ')
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Жалоба отправлена. Спасибо!')
    const [, init] = fetchMock.mock.calls.find(([input]) => input.toString() === `${boardUrl}/reports`)!
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ reason: 'illegal', message: 'Чужие персональные данные' })
  })

  it('tells the reader to try later when their address sent too many reports', async () => {
    renderPage({
      [`GET ${boardUrl}`]: { body: publicBoard },
      [`GET ${boardUrl}/document`]: { bytes: twoPages() },
      [`POST ${boardUrl}/reports`]: { status: 429 },
    })
    await shownCanvas()

    await userEvent.click(screen.getByRole('button', { name: 'Пожаловаться' }))
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Слишком много жалоб с вашего адреса. Попробуйте позже.')
  })

  it('opens the page of the address and offers a reader without a session to sign in and come back to it', async () => {
    const { router } = renderPage(
      { [`GET ${boardUrl}`]: { body: publicBoard }, [`GET ${boardUrl}/document`]: { bytes: twoPages() } },
      `/view/${boardId}?page=page-2`,
    )

    expect(await shownCanvas()).toHaveAttribute('data-page', 'page-2')
    await userEvent.click(await screen.findByRole('link', { name: 'Войти' }))

    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.state).toEqual({ from: `/boards/${boardId}?page=page-2` })
  })

  it('asks for the document with the cache of the browser, which asks the backend whether it changed', async () => {
    const { fetchMock } = renderPage({
      [`GET ${boardUrl}`]: { body: publicBoard },
      [`GET ${boardUrl}/document`]: { bytes: twoPages() },
    })

    await shownCanvas()
    const [, init] = fetchMock.mock.calls.find(([input]) => input.toString() === `${boardUrl}/document`)!
    expect(init?.cache).toBe('no-cache')
  })

  it('merges a newer state of the board into the shown one, keeping the canvas and its page', async () => {
    const doc = new Y.Doc()
    const first = addPages(doc, [{ id: 'page-1', name: 'Контекст' }])
    const second = addPages(doc, [{ id: 'page-2', name: 'Контейнеры' }])
    renderPage({
      [`GET ${boardUrl}`]: { body: publicBoard },
      [`GET ${boardUrl}/document`]: [{ bytes: first }, { bytes: second }],
    })
    await shownCanvas()
    expect(screen.queryByRole('tab', { name: 'Контейнеры' })).toBeNull()

    // The reader comes back to the tab.
    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })

    expect(await screen.findByRole('tab', { name: 'Контейнеры' })).toBeInTheDocument()
    expect(screen.getByTestId('diagram-canvas')).toHaveAttribute('data-page', 'page-1')
    expect(canvas.created).toBe(1)
    act(() => focusManager.setFocused(undefined))
  })

  it('says that a board without a stored document is empty', async () => {
    renderPage({ [`GET ${boardUrl}`]: { body: publicBoard }, [`GET ${boardUrl}/document`]: { status: 204 } })

    expect(await screen.findByText('Доска пока пуста')).toBeInTheDocument()
  })

  it('offers a signed-in user to open the board in CoDraw', async () => {
    renderPage({
      'GET /api/me': { body: ALICE },
      [`GET ${boardUrl}`]: { body: publicBoard },
      [`GET ${boardUrl}/document`]: { bytes: twoPages() },
    })

    await shownCanvas()
    expect(await screen.findByRole('link', { name: 'Открыть доску' })).toHaveAttribute(
      'href',
      `/boards/${boardId}?page=page-1`,
    )
    expect(screen.queryByRole('link', { name: 'Войти' })).toBeNull()
  })

  it('sends a reader without a session to the login page when the board is not shown to anybody', async () => {
    const { router } = renderPage({ [`GET ${boardUrl}`]: { status: 404 } }, `/view/${boardId}?page=page-2`)

    expect(await screen.findByText('Страница входа')).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ from: `/boards/${boardId}?page=page-2` })
  })

  it('sends to the login page a user whose session ended on the board, though the cache still has their profile', async () => {
    // Like the layout: the page of the board finds the session gone and opens the board for reading without one.
    function BoardWithEndedSession() {
      const queryClient = useQueryClient()
      const user = useCurrentUser()
      const loaded = user.data !== undefined
      useEffect(() => {
        if (loaded) void recheckSession(queryClient)
      }, [loaded, queryClient])
      return isUnauthorized(user.error) ? <Navigate to={`/view/${boardId}`} replace /> : <p>Страница доски</p>
    }
    mockFetch({ 'GET /api/me': [{ body: ALICE }, { status: 401 }], [`GET ${boardUrl}`]: { status: 404 } })
    renderRoutes(
      [
        { path: '/view/:boardId', element: <PublicBoardPage /> },
        { path: '/login', element: <p>Страница входа</p> },
        { path: '/boards/:boardId', element: <BoardWithEndedSession /> },
      ],
      `/boards/${boardId}`,
    )

    expect(await screen.findByText('Страница входа')).toBeInTheDocument()
  })

  it('opens the board as usual for a signed-in user when it is not shown to anybody', async () => {
    const { router } = renderPage({ 'GET /api/me': { body: ALICE }, [`GET ${boardUrl}`]: { status: 404 } })

    expect(await screen.findByText('Страница доски')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/boards/${boardId}`)
  })

  describe('in a frame of another page', () => {
    const framed = () => vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window)

    it('opens CoDraw in a new tab, not in the frame', async () => {
      framed()
      renderPage({
        'GET /api/me': { body: ALICE },
        [`GET ${boardUrl}`]: { body: publicBoard },
        [`GET ${boardUrl}/document`]: { bytes: twoPages() },
      })

      await shownCanvas()
      const open = await screen.findByRole('link', { name: 'Открыть в CoDraw' })
      expect(open).toHaveAttribute('href', `/boards/${boardId}?page=page-1`)
      expect(open).toHaveAttribute('target', '_blank')
      expect(screen.queryByRole('link', { name: 'Открыть доску' })).toBeNull()
    })

    it('says that a board not shown to anybody is not available, and stays in the frame', async () => {
      framed()
      const { router } = renderPage({ [`GET ${boardUrl}`]: { status: 404 } })

      expect(await screen.findByText('Доска недоступна без входа')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Открыть в CoDraw' })).toHaveAttribute('target', '_blank')
      expect(router.state.location.pathname).toBe(`/view/${boardId}`)
    })
  })
})
