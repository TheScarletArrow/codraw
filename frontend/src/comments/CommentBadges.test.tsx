import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CommentThread } from '../api/comments.ts'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { CommentBadges } from './CommentBadges.tsx'

const thread = (id: string, cellId: string | null, changes: Partial<CommentThread> = {}): CommentThread => ({
  id,
  pageId: 'page-1',
  cellId,
  point: null,
  decisionId: null,
  createdAt: '2026-10-05T10:00:00Z',
  resolvedAt: null,
  resolvedBy: null,
  assignee: null,
  comments: [],
  ...changes,
})

describe('CommentBadges', () => {
  it('shows the number of open threads over the top-right corner of each element of the page', () => {
    const editor = createFakeEditor()
    editor.placeCell('api', { x: 100, y: 50, width: 120, height: 60 })
    editor.placeCell('db', { x: 300, y: 50, width: 80, height: 80 })
    render(
      <CommentBadges
        editor={editor}
        threads={[
          thread('a', 'api'),
          thread('b', 'api'),
          thread('c', 'db', { resolvedAt: '2026-10-05T11:00:00Z' }),
          thread('d', null),
          thread('e', 'db', { pageId: 'page-2' }),
        ]}
        onOpen={vi.fn()}
      />,
    )

    const badges = screen.getAllByTestId('comment-badge')
    expect(badges).toHaveLength(1)
    expect(badges[0]).toHaveTextContent('2')
    expect(badges[0]).toHaveAccessibleName('Комментарии к элементу: 2')
    expect([badges[0]!.style.left, badges[0]!.style.top]).toEqual(['224px', '28px'])
  })

  it('follows the element when the view changes, and hides the badge of an element not shown', () => {
    const editor = createFakeEditor()
    editor.placeCell('api', { x: 100, y: 50, width: 120, height: 60 })
    render(<CommentBadges editor={editor} threads={[thread('a', 'api'), thread('b', 'gone')]} onOpen={vi.fn()} />)

    act(() => editor.scrollTo({ x: 20, y: 10 }))

    const badge = screen.getByTestId('comment-badge')
    expect([badge.style.left, badge.style.top]).toEqual(['204px', '18px'])
  })

  it('opens the threads of the element', async () => {
    const editor = createFakeEditor()
    editor.placeCell('api', { x: 100, y: 50, width: 120, height: 60 })
    const onOpen = vi.fn()
    render(<CommentBadges editor={editor} threads={[thread('a', 'api')]} onOpen={onOpen} />)

    await userEvent.click(screen.getByRole('button', { name: 'Комментарии к элементу: 1' }))

    expect(onOpen).toHaveBeenCalledWith('api')
  })
})
