import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getCells, writeCell, writePage } from '../diagram/model.ts'
import { writeStatus } from '../diagram/status.ts'
import { boardWith, edgeData, shapeData } from '../diagram/testing.ts'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { StatusBadges } from './StatusBadges.tsx'

const bob = { id: 'bob', name: 'Боб' }
const at = new Date(2026, 9, 7, 14, 5).getTime()

/** A board with two shapes and an edge between them, placed on the canvas of a fake editor. */
function board() {
  const doc = boardWith(shapeData('api', 'a0'), shapeData('db', 'a1'), edgeData('calls', 'a2', 'api', 'db'))
  const editor = createFakeEditor()
  editor.placeCell('api', { x: 100, y: 50, width: 120, height: 60 })
  editor.placeCell('db', { x: 300, y: 50, width: 80, height: 80 })
  editor.placeCell('calls', { x: 220, y: 70, width: 80, height: 20 })
  const cells = getCells(doc)
  const mark = (id: string, status: Parameters<typeof writeStatus>[1]) =>
    act(() => doc.transact(() => writeStatus(cells.get(id)!, status, bob, at)))
  return { doc, editor, mark }
}

describe('StatusBadges', () => {
  it('shows the status of each element of the page by its bottom-left corner, with who set it and when', () => {
    const { doc, editor, mark } = board()
    render(<StatusBadges editor={editor} document={doc} />)
    expect(screen.queryByTestId('status-badge')).toBeNull()

    mark('api', 'review')
    mark('db', 'done')

    const [api, db] = screen.getAllByTestId('status-badge')
    expect(api).toHaveAccessibleName('Нужно ревью — Боб, 7 окт. 2026 г., 14:05')
    expect(api).toHaveAttribute('title', 'Нужно ревью — Боб, 7 окт. 2026 г., 14:05')
    expect(api).toHaveAttribute('data-status', 'review')
    expect([api!.style.left, api!.style.top]).toEqual(['78px', '114px'])
    expect(db).toHaveAccessibleName('Готово — Боб, 7 окт. 2026 г., 14:05')
  })

  it('follows changes of statuses, of the view, and of the page of the canvas', () => {
    const { doc, editor, mark } = board()
    mark('api', 'draft')
    const view = render(<StatusBadges editor={editor} document={doc} />)

    act(() => editor.scrollTo({ x: 20, y: 10 }))
    expect([screen.getByTestId('status-badge').style.left, screen.getByTestId('status-badge').style.top]).toEqual([
      '58px',
      '104px',
    ])

    mark('api', null)
    expect(screen.queryByTestId('status-badge')).toBeNull()

    mark('api', 'done')
    act(() => getCells(doc).delete('api'))
    expect(screen.queryByTestId('status-badge')).toBeNull()

    act(() =>
      doc.transact(() => {
        writePage(doc, 'second', { name: 'Вторая', order: 'b0' })
        writeCell(getCells(doc, 'second'), shapeData('queue', 'a0'))
        writeStatus(getCells(doc, 'second').get('queue')!, 'review', bob, at)
      }),
    )
    const other = createFakeEditor({ pageId: 'second' })
    other.placeCell('queue', { x: 10, y: 10, width: 100, height: 40 })
    view.rerender(<StatusBadges editor={other} document={doc} />)
    expect(screen.getByTestId('status-badge')).toHaveAttribute('data-cell', 'queue')
  })

  it('shows no status of an edge or of an element the canvas does not show', () => {
    const { doc, editor } = board()
    act(() =>
      doc.transact(() => {
        getCells(doc).get('calls')!.set('status', 'review')
        writeCell(getCells(doc), shapeData('hidden', 'a3'))
        writeStatus(getCells(doc).get('hidden')!, 'review', bob, at)
      }),
    )

    render(<StatusBadges editor={editor} document={doc} />)

    expect(screen.queryByTestId('status-badge')).toBeNull()
  })
})
