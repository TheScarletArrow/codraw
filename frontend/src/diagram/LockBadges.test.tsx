import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { LockBadges } from './LockBadges.tsx'

describe('LockBadges', () => {
  it('shows a lock over the top-left corner of each locked element that holds the selection, with who locked it', () => {
    const editor = createFakeEditor()
    editor.placeCell('api', { x: 100, y: 50, width: 120, height: 60 })
    editor.placeCell('db', { x: 300, y: 50, width: 80, height: 80 })
    render(<LockBadges editor={editor} />)
    expect(screen.queryByTestId('lock-badge')).toBeNull()

    act(() =>
      editor.setState({
        lock: {
          all: true,
          canLock: false,
          locks: [
            { cellId: 'api', lockedBy: 'Алиса' },
            { cellId: 'db', lockedBy: null },
          ],
        },
      }),
    )

    const [api, db] = screen.getAllByTestId('lock-badge')
    expect(api).toHaveAccessibleName('Закреплено: Алиса')
    expect(api).toHaveAttribute('title', 'Закреплено: Алиса')
    expect([api!.style.left, api!.style.top]).toEqual(['78px', '28px'])
    expect(db).toHaveAccessibleName('Закреплено')
  })

  it('follows the element when the view changes, and hides the lock of an element not shown', () => {
    const editor = createFakeEditor()
    editor.placeCell('api', { x: 100, y: 50, width: 120, height: 60 })
    render(<LockBadges editor={editor} />)
    act(() =>
      editor.setState({
        lock: {
          all: false,
          canLock: true,
          locks: [
            { cellId: 'api', lockedBy: 'Алиса' },
            { cellId: 'gone', lockedBy: 'Боб' },
          ],
        },
      }),
    )

    act(() => editor.scrollTo({ x: 20, y: 10 }))

    const badges = screen.getAllByTestId('lock-badge')
    expect(badges).toHaveLength(1)
    expect([badges[0]!.style.left, badges[0]!.style.top]).toEqual(['58px', '18px'])
  })
})
