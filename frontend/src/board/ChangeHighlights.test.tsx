import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { diffDocuments, type PageDiff } from '../diagram/diff.ts'
import { getCells, writeCell } from '../diagram/model.ts'
import { boardWith, edgeData, laterState, shapeData } from '../diagram/testing.ts'
import { createFakeEditor } from '../test/fakeEditor.ts'
import { ChangeHighlights } from './ChangeHighlights.tsx'

/**
 * A board that, since the version, got a shape and an edge, renamed a shape and lost a shape inside a group and an
 * edge to it.
 */
function changedPage(): PageDiff {
  const version = boardWith(
    shapeData('api', 'a0', { value: 'API', geometry: { x: 100, y: 100, width: 120, height: 60 } }),
    shapeData('group', 'a1', { style: { fillColor: 'none', strokeColor: 'none' }, geometry: { x: 300, y: 100, width: 200, height: 200 } }),
    shapeData('cache', 'a0', { parent: 'group', value: 'Кэш', geometry: { x: 20, y: 40, width: 90, height: 70 } }),
    shapeData('db', 'a2', { value: 'БД', geometry: { x: 100, y: 400, width: 100, height: 100 } }),
    edgeData('to-cache', 'a3', 'db', 'cache'),
  )
  const now = laterState(version, (doc) => {
    getCells(doc).get('api')!.set('value', 'Шлюз')
    getCells(doc).delete('cache')
    getCells(doc).delete('to-cache')
    writeCell(getCells(doc), shapeData('queue', 'a4', { value: 'Очередь' }))
    writeCell(getCells(doc), edgeData('to-queue', 'a5', 'api', 'queue'))
  })
  return diffDocuments(version, now).pages[0]!
}

const marks = () =>
  screen.queryAllByTestId('change-mark').map((mark) => [mark.dataset.change, mark.dataset.cell, mark.tagName.toLowerCase()])

describe('ChangeHighlights', () => {
  it('frames added and changed elements where the canvas shows them, and draws removed ones where the version had them', () => {
    const editor = createFakeEditor()
    editor.placeCell('api', { x: 100, y: 100, width: 140, height: 60 })
    editor.placeCell('queue', { x: 500, y: 100, width: 120, height: 60 })
    editor.placeEdge('to-queue', [
      { x: 240, y: 130 },
      { x: 500, y: 130 },
    ])
    const { container } = render(<ChangeHighlights editor={editor} page={changedPage()} selectedId={null} />)

    expect(marks()).toEqual([
      ['added', 'to-queue', 'g'],
      ['removed', 'to-cache', 'g'],
      ['added', 'queue', 'div'],
      ['changed', 'api', 'div'],
      ['removed', 'cache', 'div'],
    ])
    const frame = (id: string) => screen.getAllByTestId('change-mark').find((mark) => mark.dataset.cell === id)!
    // Frames lie a few pixels outside the shapes.
    expect([frame('api').style.left, frame('api').style.top, frame('api').style.width]).toEqual(['96px', '96px', '148px'])
    expect(frame('api').className).toContain('border-dotted')
    expect(frame('queue').className).toContain('border-solid')
    // The ghost of a shape of a group: where the group had it in the version, dashed and hatched, with its label.
    expect([frame('cache').style.left, frame('cache').style.top, frame('cache').style.height]).toEqual(['316px', '136px', '78px'])
    expect(frame('cache').className).toContain('border-dashed')
    expect(frame('cache').className).toContain('change-ghost')
    expect(frame('cache')).toHaveTextContent('Кэш')
    // A removed edge goes from the border of its source to the border of its target in the version.
    const [, removedLine] = frame('to-cache').querySelectorAll('polyline')
    expect(removedLine!.getAttribute('points')).toBe('189.1,400 337.6,210')
    expect(removedLine!.getAttribute('stroke-dasharray')).toBe('7 5')
    // Every change has its sign, not only its color.
    expect([...container.querySelectorAll('[data-change-icon]')].map((icon) => icon.getAttribute('data-change-icon'))).toEqual([
      'added',
      'added',
      'changed',
      'removed',
      'removed',
    ])
  })

  it('follows the canvas when it scrolls', () => {
    const editor = createFakeEditor()
    editor.placeCell('api', { x: 100, y: 100, width: 140, height: 60 })
    render(<ChangeHighlights editor={editor} page={changedPage()} selectedId={null} />)
    const frame = (id: string) => screen.getAllByTestId('change-mark').find((mark) => mark.dataset.cell === id)!

    act(() => editor.scrollTo({ x: 50, y: 20 }))

    expect([frame('api').style.left, frame('api').style.top]).toEqual(['46px', '76px'])
    expect([frame('cache').style.left, frame('cache').style.top]).toEqual(['266px', '116px'])
  })

  it('marks the element chosen in the list', () => {
    const editor = createFakeEditor()
    editor.placeCell('api', { x: 100, y: 100, width: 140, height: 60 })
    render(<ChangeHighlights editor={editor} page={changedPage()} selectedId="cache" />)

    const selected = screen.getAllByTestId('change-mark').filter((mark) => mark.dataset.selected)
    expect(selected.map((mark) => mark.dataset.cell)).toEqual(['cache'])
  })

  it('draws nothing for a page without changes, and skips elements the canvas does not show', () => {
    const editor = createFakeEditor()
    const { rerender } = render(<ChangeHighlights editor={editor} page={undefined} selectedId={null} />)
    expect(marks()).toEqual([])

    rerender(<ChangeHighlights editor={editor} page={changedPage()} selectedId={null} />)
    expect(marks().map(([type, id]) => `${type} ${id}`)).toEqual(['removed to-cache', 'removed cache'])
  })
})
