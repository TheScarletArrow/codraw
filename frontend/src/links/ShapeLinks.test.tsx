import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boardLink } from '../diagram/links.ts'
import type { PageInfo } from '../diagram/pages.ts'
import { createFakeEditor, type FakeEditor } from '../test/fakeEditor.ts'
import { mockFetch, renderRoutes } from '../test/render.tsx'
import { LINK_MESSAGE_DURATION, LINK_MESSAGES } from './linkTexts.ts'
import { ShapeLinks } from './ShapeLinks.tsx'

const PAGES: PageInfo[] = [
  { id: 'context', name: 'Контекст', order: 'a0' },
  { id: 'containers', name: 'Контейнеры', order: 'a1' },
]

const board = (id: string, title: string, owner = 'Алиса') => ({
  id,
  title,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
  linkAccess: 'none',
  owner: { id: `owner-${owner}`, name: owner, avatarUrl: null },
  role: 'owner',
})

describe('ShapeLinks', () => {
  let editor: FakeEditor
  let onSelectPage: ReturnType<typeof vi.fn<(pageId: string) => void>>
  let onNavigate: ReturnType<typeof vi.fn<() => void>>

  beforeEach(() => {
    editor = createFakeEditor({ pageId: 'context' })
    onSelectPage = vi.fn()
    onNavigate = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function show() {
    return renderRoutes([
      {
        path: '/boards/:boardId',
        element: <ShapeLinks editor={editor} pages={PAGES} onSelectPage={onSelectPage} onNavigate={onNavigate} />,
      },
      { path: '*', element: <p>Другая страница приложения</p> },
    ], '/boards/current')
  }

  it('shows a badge over the bottom-right corner of each element with a link, which says where it leads', async () => {
    mockFetch({ 'GET /api/boards': { body: [board('b-1', 'Платежи')] }, 'GET /api/boards/shared': { body: [] } })
    editor.placeCell('api', { x: 100, y: 50, width: 120, height: 60 })
    editor.placeCell('db', { x: 300, y: 50, width: 80, height: 80 })
    editor.placeCell('docs', { x: 500, y: 50, width: 80, height: 40 })
    editor.placeCell('mail', { x: 700, y: 50, width: 80, height: 40 })
    editor.placeLinks([
      { cellId: 'api', link: 'data:page/id,containers' },
      { cellId: 'db', link: boardLink('b-1') },
      { cellId: 'docs', link: 'https://docs.example.com/payments' },
      { cellId: 'mail', link: 'mailto:team@example.com' },
      { cellId: 'gone', link: 'https://example.com' },
    ])
    show()

    const badges = await screen.findAllByTestId('link-badge')
    expect(badges.map((badge) => [badge.dataset.cell, badge.dataset.kind, badge.title])).toEqual([
      ['api', 'page', 'Страница «Контейнеры»'],
      ['db', 'board', 'Другая доска'],
      ['docs', 'url', 'https://docs.example.com/payments'],
      ['mail', 'url', 'team@example.com'],
    ])
    expect(badges[0]).toHaveAccessibleName('Перейти по ссылке: Страница «Контейнеры»')
    expect([badges[0]!.style.left, badges[0]!.style.top]).toEqual(['224px', '114px'])
    // The names of the boards come with the list of boards of the participant.
    await waitFor(() => expect(badges[1]).toHaveAttribute('title', 'Доска «Платежи»'))

    act(() => editor.scrollTo({ x: 20, y: 10 }))
    expect([badges[0]!.style.left, badges[0]!.style.top]).toEqual(['204px', '104px'])
  })

  it('opens a page of the board from the badge and from a click with Ctrl, ending following', async () => {
    editor.placeCell('api', { x: 100, y: 50, width: 120, height: 60 })
    editor.placeLinks([{ cellId: 'api', link: 'data:page/id,containers' }])
    show()

    await userEvent.click(await screen.findByTestId('link-badge'))
    act(() => editor.clickLink({ cellId: 'api', link: 'data:page/id,containers' }))

    expect(onSelectPage.mock.calls).toEqual([['containers'], ['containers']])
    expect(onNavigate).toHaveBeenCalledTimes(2)
  })

  it('opens an address in a new tab that knows nothing of the board', async () => {
    const open = vi.fn(() => null)
    vi.stubGlobal('open', open)
    editor.placeCell('docs', { x: 100, y: 50, width: 120, height: 60 })
    editor.placeLinks([{ cellId: 'docs', link: 'https://docs.example.com/a b' }])
    show()

    await userEvent.click(await screen.findByTestId('link-badge'))

    expect(open).toHaveBeenCalledWith('https://docs.example.com/a%20b', '_blank', 'noopener,noreferrer')
    expect(onSelectPage).not.toHaveBeenCalled()
  })

  it('opens a board in CoDraw, on its page', async () => {
    mockFetch({ 'GET /api/boards/b-1': { body: board('b-1', 'Платежи') } })
    const { router } = show()

    act(() => editor.clickLink({ cellId: 'db', link: `${boardLink('b-1')}?page=p-2` }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/boards/b-1'))
    expect(router.state.location.search).toBe('?page=p-2')
  })

  it('opens a board that the participant may not open, where they may ask for access', async () => {
    mockFetch({ 'GET /api/boards/b-1': { status: 403 } })
    const { router } = show()

    act(() => editor.clickLink({ cellId: 'db', link: boardLink('b-1') }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/boards/b-1'))
  })

  it('stays when the page or the board of a link is gone, and says so for a while', async () => {
    mockFetch({ 'GET /api/boards/b-2': { status: 404 } })
    const { router } = show()

    act(() => editor.clickLink({ cellId: 'api', link: 'data:page/id,deleted' }))
    expect(screen.getByRole('alert')).toHaveTextContent(LINK_MESSAGES.page)
    expect(onSelectPage).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(screen.queryByRole('alert')).toBeNull()

    act(() => editor.clickLink({ cellId: 'db', link: boardLink('b-2') }))
    expect(await screen.findByRole('alert')).toHaveTextContent(LINK_MESSAGES.board)
    expect(router.state.location.pathname).toBe('/boards/current')

    vi.useFakeTimers()
    act(() => editor.clickLink({ cellId: 'api', link: 'data:page/id,deleted' }))
    act(() => vi.advanceTimersByTime(LINK_MESSAGE_DURATION))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('opens nothing that CoDraw does not open', () => {
    const open = vi.fn(() => null)
    vi.stubGlobal('open', open)
    editor.placeCell('bad', { x: 100, y: 50, width: 120, height: 60 })
    editor.placeLinks([{ cellId: 'bad', link: 'javascript:alert(1)' }])
    show()

    act(() => editor.clickLink({ cellId: 'bad', link: 'javascript:alert(1)' }))

    expect(screen.queryByTestId('link-badge')).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent(LINK_MESSAGES.unsafe)
    expect(open).not.toHaveBeenCalled()
  })
})
