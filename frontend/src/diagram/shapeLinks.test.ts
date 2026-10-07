import { Geometry, type Cell, type CellStyle } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type CellLink, type DiagramEditor, type Point } from './editor.ts'
import { getCells, initializeDocument, readCell } from './model.ts'
import { connect } from './testing.ts'

const PAGE = 'data:page/id,containers'
const DOCS = 'https://docs.example.com/payments'

describe('links of elements', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    document.body.replaceChildren()
  })

  /** An editor at the top-left corner of the window, so that points of the window are points of the page. */
  function open({ doc = new Y.Doc(), readOnly = false } = {}) {
    if (!readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    container.tabIndex = 0
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly, participantName: 'Алиса' })
    editors.push(editor)
    return { doc, editor, container }
  }

  function shape(editor: DiagramEditor, x: number, y: number): Cell {
    const cell = editor.addShape('rectangle', { x: 0, y: 0 })!
    editor.graph.getDataModel().setGeometry(cell, new Geometry(x, y, 120, 60))
    return cell
  }

  /** Gives `cell` a link, selected alone, as the window «Ссылка» does. */
  function link(editor: DiagramEditor, cell: Cell, value: string | null) {
    editor.graph.setSelectionCell(cell)
    editor.setLink(value)
  }

  const storedStyle = (doc: Y.Doc, cell: Cell) => readCell(cell.getId()!, getCells(doc).get(cell.getId()!)!).style
  /** The style of a cell in the model, with the keys of CoDraw. */
  const styleOf = (cell: Cell) => cell.getStyle() as Record<string, unknown>
  /** Writes a link into the style of a cell bypassing the command, as a file or another program might. */
  const writeLink = (editor: DiagramEditor, cell: Cell, value: string) =>
    editor.graph.getDataModel().setStyle(cell, { ...cell.getStyle(), link: value } as CellStyle)

  it('sets, replaces and removes the link of the selected element, each as one undo step that every participant sees', () => {
    const { doc, editor } = open()
    const other = open({ doc: new Y.Doc() })
    connect(doc, other.doc)
    const cell = shape(editor, 100, 100)
    const theirs = () => other.editor.graph.getDataModel().getCell(cell.getId()!)!

    link(editor, cell, PAGE)
    expect(storedStyle(doc, cell).link).toBe(PAGE)
    expect(styleOf(theirs()).link).toBe(PAGE)
    expect(editor.getState().link).toEqual({ cellId: cell.getId(), link: PAGE, canChange: true })

    editor.setLink(DOCS)
    expect(styleOf(theirs()).link).toBe(DOCS)
    editor.setLink(null)
    expect(storedStyle(doc, cell)).not.toHaveProperty('link')
    expect(editor.getState().link).toEqual({ cellId: cell.getId(), link: null, canChange: true })

    editor.undo()
    expect(styleOf(theirs()).link).toBe(DOCS)
    editor.undo()
    expect(styleOf(theirs()).link).toBe(PAGE)
    editor.undo()
    expect(styleOf(theirs())).not.toHaveProperty('link')
    editor.redo()
    expect(storedStyle(doc, cell).link).toBe(PAGE)
  })

  it('sets no link that CoDraw would not open', () => {
    const { doc, editor } = open()
    const cell = shape(editor, 100, 100)
    link(editor, cell, DOCS)

    for (const value of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'docs']) editor.setLink(value)

    expect(storedStyle(doc, cell).link).toBe(DOCS)
  })

  it('links shapes, tables, groups and edges, one at a time, but no field', () => {
    const { editor } = open()
    const a = shape(editor, 100, 100)
    const b = shape(editor, 400, 100)
    const edge = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: a, target: b })
    const table = editor.addShape('table', { x: 300, y: 400 })!
    const field = table.getChildAt(0)
    editor.graph.setSelectionCells([shape(editor, 100, 600), shape(editor, 300, 600)])
    const group = editor.group()!

    for (const cell of [edge, table, group, group.getChildAt(0)]) {
      link(editor, cell, DOCS)
      expect(styleOf(cell).link).toBe(DOCS)
      expect(editor.getState().link?.cellId).toBe(cell.getId())
    }
    link(editor, field, DOCS)
    expect(styleOf(field)).not.toHaveProperty('link')
    expect(editor.getState().link).toBeNull()
    editor.graph.setSelectionCells([a, b])
    editor.setLink(PAGE)
    expect([styleOf(a), styleOf(b)]).toEqual([expect.not.objectContaining({ link: PAGE }), expect.not.objectContaining({ link: PAGE })])
    expect(editor.getState().link).toBeNull()
  })

  it('changes no link of a locked element, and none for a participant who may only view', () => {
    const { doc, editor } = open()
    const cell = shape(editor, 100, 100)
    link(editor, cell, DOCS)
    editor.setLocked(true)

    editor.setLink(PAGE)
    expect(styleOf(cell).link).toBe(DOCS)
    expect(editor.getState().link).toEqual({ cellId: cell.getId(), link: DOCS, canChange: false })

    editor.setLocked(false)
    const viewer = open({ doc, readOnly: true }).editor
    const before = Y.encodeStateVector(doc)
    viewer.graph.setSelectionCell(viewer.graph.getDataModel().getCell(cell.getId()!)!)
    viewer.setLink(PAGE)
    expect(Y.encodeStateVector(doc)).toEqual(before)
    expect(viewer.getState().link).toEqual({ cellId: cell.getId(), link: DOCS, canChange: false })
  })

  it('lists the links of the page that CoDraw opens, the same until the page changes', () => {
    const { editor } = open()
    const a = shape(editor, 100, 100)
    const b = shape(editor, 400, 100)
    const bad = shape(editor, 700, 100)
    const table = editor.addShape('table', { x: 300, y: 400 })!
    link(editor, a, PAGE)
    link(editor, b, DOCS)
    writeLink(editor, bad, 'javascript:alert(1)')
    // A link of a field from a file is kept, but a field is not linked.
    writeLink(editor, table.getChildAt(0), DOCS)
    editor.graph.setSelectionCells([a, b])
    const group = editor.group()!

    const links = editor.getLinks()
    expect(links).toEqual([
      { cellId: a.getId(), link: PAGE },
      { cellId: b.getId(), link: DOCS },
    ])
    expect(editor.getLinks()).toBe(links)

    link(editor, group, DOCS)
    expect(editor.getLinks()).not.toBe(links)
    expect(editor.getLinks().map((entry) => entry.cellId)).toEqual([group.getId(), a.getId(), b.getId()])
  })

  describe('Ctrl+click', () => {
    const pointer = (type: string, { x, y }: Point, ctrlKey: boolean) =>
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        ctrlKey,
        pointerId: 1,
        isPrimary: true,
        pointerType: 'mouse',
      })

    /** The element that the browser would dispatch pointer events over the cell at. */
    const nodeOf = (editor: DiagramEditor, cell: Cell) => editor.graph.getView().getState(cell)!.shape!.node as Element

    function click(target: Element, path: Point[], ctrlKey = true) {
      const [start, ...rest] = path
      target.dispatchEvent(pointer('pointerdown', start!, ctrlKey))
      for (const point of rest) target.dispatchEvent(pointer('pointermove', point, ctrlKey))
      target.dispatchEvent(pointer('pointerup', rest.at(-1) ?? start!, ctrlKey))
    }

    function record(editor: DiagramEditor) {
      const opened: CellLink[] = []
      editor.onLinkOpen((opening) => opened.push(opening))
      return opened
    }

    it('reports the link of the element and selects and moves nothing', () => {
      const { editor } = open()
      const linked = shape(editor, 100, 100)
      const other = shape(editor, 400, 100)
      link(editor, linked, PAGE)
      editor.graph.setSelectionCell(other)
      const opened = record(editor)

      click(nodeOf(editor, linked), [{ x: 160, y: 130 }])

      expect(opened).toEqual([{ cellId: linked.getId(), link: PAGE }])
      expect(editor.graph.getSelectionCells()).toEqual([other])

      click(nodeOf(editor, linked), [
        { x: 160, y: 130 },
        { x: 260, y: 230 },
      ])
      expect(opened).toHaveLength(1)
      expect(linked.getGeometry()).toMatchObject({ x: 100, y: 100 })
      expect(editor.graph.getSelectionCells()).toEqual([other])
    })

    it('follows the link of the table of a field and of the group of a shape', () => {
      const { editor } = open()
      const table = editor.addShape('table', { x: 300, y: 300 })!
      editor.graph.setSelectionCells([shape(editor, 100, 600), shape(editor, 300, 600)])
      const group = editor.group()!
      link(editor, table, DOCS)
      link(editor, group, PAGE)
      editor.graph.clearSelection()
      const opened = record(editor)

      const field = editor.graph.getView().getState(table.getChildAt(0))!
      click(nodeOf(editor, table.getChildAt(0)), [{ x: field.getCenterX(), y: field.getCenterY() }])
      click(nodeOf(editor, group.getChildAt(0)), [{ x: 160, y: 630 }])

      expect(opened).toEqual([
        { cellId: table.getId(), link: DOCS },
        { cellId: group.getId(), link: PAGE },
      ])
      expect(editor.graph.getSelectionCount()).toBe(0)
    })

    it('leaves clicks without Ctrl, and on elements without a link, to the canvas, viewers following links too', () => {
      const { doc, editor } = open()
      const linked = shape(editor, 100, 100)
      const plain = shape(editor, 400, 100)
      const bad = shape(editor, 700, 100)
      link(editor, linked, DOCS)
      writeLink(editor, bad, 'javascript:alert(1)')
      editor.graph.clearSelection()
      const opened = record(editor)

      click(nodeOf(editor, linked), [{ x: 160, y: 130 }], false)
      expect(editor.graph.getSelectionCells()).toEqual([linked])
      click(nodeOf(editor, plain), [{ x: 460, y: 130 }])
      click(nodeOf(editor, bad), [{ x: 760, y: 130 }])
      expect(editor.graph.getSelectionCells()).toEqual([linked, plain, bad])
      expect(opened).toEqual([])

      const viewer = open({ doc, readOnly: true }).editor
      const seen = record(viewer)
      click(nodeOf(viewer, viewer.graph.getDataModel().getCell(linked.getId()!)!), [{ x: 160, y: 130 }])
      expect(seen).toEqual([{ cellId: linked.getId(), link: DOCS }])
    })

    it('leaves the button to the comment tool', () => {
      const { editor } = open()
      const linked = shape(editor, 100, 100)
      link(editor, linked, DOCS)
      const opened = record(editor)
      const comments: Point[] = []
      editor.onCommentPoint((point) => comments.push(point))

      editor.setCommentTool(true)
      click(nodeOf(editor, linked), [{ x: 160, y: 130 }])

      expect(opened).toEqual([])
      expect(comments).toEqual([{ x: 160, y: 130 }])
    })

    it('starts no editing of the label with a double click', () => {
      const { editor } = open()
      const linked = shape(editor, 100, 100)
      link(editor, linked, DOCS)
      editor.graph.clearSelection()
      const node = nodeOf(editor, linked)

      click(node, [{ x: 160, y: 130 }])
      click(node, [{ x: 160, y: 130 }])
      node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 160, clientY: 130, ctrlKey: true }))

      expect(editor.graph.isEditing()).toBe(false)
      // Without Ctrl, a double click edits the label, as before.
      click(node, [{ x: 160, y: 130 }], false)
      click(node, [{ x: 160, y: 130 }], false)
      node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 160, clientY: 130 }))
      expect(editor.graph.isEditing()).toBe(true)
    })
  })
})
