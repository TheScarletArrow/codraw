import { Geometry, Point, type Cell, type SelectionHandler } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { initializeDocument } from './model.ts'

describe('moving the selection with the keys', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open({ readOnly = false, doc = new Y.Doc() } = {}) {
    if (!readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly })
    editors.push(editor)
    return { doc, editor, container }
  }

  function shape(editor: DiagramEditor, x: number, y: number): Cell {
    const cell = editor.addShape('rectangle', { x: 0, y: 0 })!
    editor.graph.getDataModel().setGeometry(cell, new Geometry(x, y, 100, 60))
    return cell
  }

  const position = (cell: Cell) => [cell.getGeometry()!.x, cell.getGeometry()!.y]

  /** Presses a key on the canvas as the browser would, with its legacy key code that maxGraph reads. */
  const press = (container: HTMLElement, keyCode: number, shiftKey = false) =>
    container.dispatchEvent(new KeyboardEvent('keydown', { keyCode, shiftKey, bubbles: true, cancelable: true }))

  it('moves the selected shape by a pixel, each move one undo step', () => {
    const { editor } = open()
    const cell = shape(editor, 100, 100)
    editor.graph.setSelectionCell(cell)

    editor.moveSelection(1, 0)
    editor.moveSelection(1, 0)
    editor.moveSelection(1, 0)

    expect(position(cell)).toEqual([103, 100])
    editor.undo()
    expect(position(cell)).toEqual([102, 100])
  })

  it('moves with the arrow keys by a pixel, and with Shift by a step of the grid', () => {
    const { editor, container } = open()
    const cell = shape(editor, 100, 100)
    editor.graph.setSelectionCell(cell)

    press(container, 39)
    press(container, 37)
    press(container, 37)
    press(container, 40, true)
    press(container, 38)

    expect(position(cell)).toEqual([99, 109])
  })

  it('moves the table of a selected field', () => {
    const { editor } = open()
    const table = editor.addShape('table', { x: 200, y: 200 })!
    const [x, y] = position(table)
    editor.graph.setSelectionCell(table.getChildAt(0))

    editor.moveSelection(-1, 0)

    expect(position(table)).toEqual([x! - 1, y])
    expect(position(table.getChildAt(0))[0]).toBe(0)
  })

  it('moves the bend points of an edge selected with its shapes', () => {
    const { editor } = open()
    const a = shape(editor, 0, 0)
    const b = shape(editor, 300, 200)
    const edge = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: a, target: b })
    const geometry = edge.getGeometry()!.clone()
    geometry.points = [new Point(150, 30)]
    editor.graph.getDataModel().setGeometry(edge, geometry)
    editor.graph.setSelectionCells([a, b, edge])

    editor.moveSelection(10, 0)

    expect(position(a)).toEqual([10, 0])
    expect(position(b)).toEqual([310, 200])
    expect(edge.getGeometry()!.points).toEqual([new Point(160, 30)])
    expect(edge.getTerminal(true)).toBe(a)
  })

  it('moves nothing without a selection, and nothing for a participant who may only view', () => {
    const { doc, editor } = open()
    const cell = shape(editor, 100, 100)
    editor.graph.clearSelection()
    editor.moveSelection(5, 5)
    expect(position(cell)).toEqual([100, 100])

    const { editor: viewer, container } = open({ readOnly: true, doc })
    viewer.graph.selectAll()
    viewer.moveSelection(5, 5)
    press(container, 39)

    expect(position(viewer.graph.getDefaultParent().getChildAt(0))).toEqual([100, 100])
  })

  it('shows guides in the color of the selection while shapes are dragged, unless Alt is held', () => {
    const { editor } = open()
    const handler = editor.graph.getPlugin<SelectionHandler>('SelectionHandler')!

    expect(handler.guidesEnabled).toBe(true)
    const guide = handler.createGuide()
    expect(guide.getGuideColor(null as never, true)).toBe('#2563eb')
    expect(guide.isEnabledForEvent(new MouseEvent('mousemove'))).toBe(true)
    expect(guide.isEnabledForEvent(new MouseEvent('mousemove', { altKey: true }))).toBe(false)
  })
})
