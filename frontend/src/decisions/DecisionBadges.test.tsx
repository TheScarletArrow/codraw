import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Decision } from '../api/decisions.ts'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { DecisionBadges } from './DecisionBadges.tsx'

const decision = (id: string, elements: Decision['elements']): Decision => ({
  id,
  number: 1,
  title: id,
  status: 'accepted',
  supersededBy: null,
  decidedOn: '2026-10-09',
  author: null,
  context: '',
  options: '',
  outcome: '',
  consequences: '',
  elements,
  createdAt: '2026-10-09T10:00:00Z',
  updatedAt: '2026-10-09T10:00:00Z',
})

describe('DecisionBadges', () => {
  it('shows the number of decisions about each element of the page by its bottom-right corner', () => {
    const editor = createFakeEditor()
    editor.placeCell('queue', { x: 100, y: 50, width: 120, height: 60 })
    editor.placeCell('db', { x: 300, y: 50, width: 80, height: 80 })
    render(
      <DecisionBadges
        editor={editor}
        decisions={[
          decision('kafka', [
            { pageId: 'page-1', cellId: 'queue' },
            { pageId: 'page-2', cellId: 'db' },
          ]),
          decision('rabbit', [{ pageId: 'page-1', cellId: 'queue' }]),
          decision('gone', [{ pageId: 'page-1', cellId: 'gone' }]),
        ]}
        onOpen={vi.fn()}
      />,
    )

    const badges = screen.getAllByTestId('decision-badge')
    expect(badges).toHaveLength(1)
    expect(badges[0]).toHaveTextContent('2')
    expect(badges[0]).toHaveAccessibleName('Решения элемента: 2')
    expect(badges[0]).toHaveAttribute('title', 'Решения (2)')
    expect([badges[0]!.style.left, badges[0]!.style.top]).toEqual(['224px', '114px'])

    act(() => editor.scrollTo({ x: 20, y: 10 }))
    expect([badges[0]!.style.left, badges[0]!.style.top]).toEqual(['204px', '104px'])
  })

  it('opens the decisions of the element', async () => {
    const editor = createFakeEditor()
    editor.placeCell('queue', { x: 100, y: 50, width: 120, height: 60 })
    const onOpen = vi.fn()
    render(<DecisionBadges editor={editor} decisions={[decision('kafka', [{ pageId: 'page-1', cellId: 'queue' }])]} onOpen={onOpen} />)

    await userEvent.click(screen.getByRole('button', { name: 'Решения элемента: 1' }))

    expect(onOpen).toHaveBeenCalledWith('queue')
  })
})
