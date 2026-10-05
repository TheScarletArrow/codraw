import { Geometry, type Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { clipboardText, readClipboardText } from './clipboardFormat.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { initializeDocument } from './model.ts'

/** A fragment that draw.io puts into the clipboard: two rectangles and an edge between them. */
const DRAWIO_FRAGMENT =
  '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
  '<mxCell id="a" value="A" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;" vertex="1" parent="1">' +
  '<mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>' +
  '<mxCell id="b" value="&lt;b&gt;B&lt;/b&gt;" style="whiteSpace=wrap;html=1;" vertex="1" parent="1">' +
  '<mxGeometry x="240" y="40" width="120" height="60" as="geometry"/></mxCell>' +
  '<mxCell id="e" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="a" target="b">' +
  '<mxGeometry relative="1" as="geometry"/></mxCell>' +
  '</root></mxGraphModel>'

/** Fires a clipboard event at `target` with a clipboard that holds `text`; returns what the handler wrote. */
function fireClipboard(type: 'copy' | 'cut' | 'paste', target: EventTarget, text = '') {
  const data = new Map([['text/plain', text]])
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: { setData: (kind: string, value: string) => data.set(kind, value), getData: (kind: string) => data.get(kind) ?? '' },
  })
  target.dispatchEvent(event)
  return { handled: event.defaultPrevented, text: data.get('text/plain') ?? '' }
}

describe('clipboard format', () => {
  it('writes copied cells as an encoded model of draw.io and reads them back with children and edges', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const doc = new Y.Doc()
    initializeDocument(doc)
    const editor = createDiagramEditor(container, doc)
    const table = editor.addShape('table', { x: 100, y: 100 })!
    const service = editor.addShape('rectangle', { x: 400, y: 100 })!
    editor.graph.getDataModel().setValue(service, 'Сервис\nAPI')
    editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: table.getChildAt(0), target: service })

    const text = clipboardText(editor.graph.cloneCells(editor.graph.getDefaultParent().getChildren(), false))
    editor.destroy()

    expect(text.startsWith('%3CmxGraphModel%3E')).toBe(true)
    expect(decodeURIComponent(text)).toContain('<mxCell id="0"/><mxCell id="1" parent="0"/>')
    const content = await readClipboardText(text)
    expect(content?.kind).toBe('cells')
    const cells = content?.kind === 'cells' ? content.cells : []
    const [pastedTable, pastedService, pastedEdge] = cells
    expect(pastedTable!.getChildCount()).toBe(1)
    expect(pastedTable!.getChildAt(0).getValue()).toBe('id uuid PK')
    expect(pastedService!.getValue()).toBe('Сервис\nAPI')
    expect(pastedEdge!.getTerminal(true)).toBe(pastedTable!.getChildAt(0))
    expect(pastedEdge!.getTerminal(false)).toBe(pastedService)
  })

  it('reads a fragment of draw.io, encoded or not, and the first page of a file', async () => {
    for (const text of [DRAWIO_FRAGMENT, encodeURIComponent(DRAWIO_FRAGMENT), `<mxfile><diagram name="P">${DRAWIO_FRAGMENT}</diagram></mxfile>`]) {
      const content = await readClipboardText(text)
      const cells = content?.kind === 'cells' ? content.cells : []
      expect(cells.map((cell) => cell.getValue())).toEqual(['A', 'B', ''])
      expect(cells[0]!.getStyle()).toMatchObject({ rounded: true, fillColor: '#dae8fc' })
      expect(cells[2]!.getTerminal(true)).toBe(cells[0])
      expect(cells[2]!.getTerminal(false)).toBe(cells[1])
    }
  })

  it('reads other text as text without spaces at its ends, and has nothing for blank text', async () => {
    expect(await readClipboardText('  Платёжный шлюз\nверсия 2 \n')).toEqual({ kind: 'text', text: 'Платёжный шлюз\nверсия 2' })
    expect(await readClipboardText('<mxGraphModel>не схема')).toEqual({ kind: 'text', text: '<mxGraphModel>не схема' })
    expect(await readClipboardText(' \n ')).toBeNull()
  })
})

describe('clipboard events of the canvas', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open({ readOnly = false } = {}) {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly })
    editors.push(editor)
    return { doc, editor, container }
  }

  function shape(editor: DiagramEditor, x: number, y: number, label: string): Cell {
    const cell = editor.addShape('rectangle', { x: 0, y: 0 })!
    const model = editor.graph.getDataModel()
    model.setGeometry(cell, new Geometry(x, y, 100, 60))
    model.setValue(cell, label)
    return cell
  }

  const shapes = (editor: DiagramEditor) => editor.graph.getDefaultParent().getChildren().filter((cell) => cell.isVertex())

  it('copies the selection into the clipboard of the system and pastes the same content shifted by 20 each time', () => {
    const { editor, container } = open()
    editor.graph.setSelectionCell(shape(editor, 100, 100, 'Сервис'))

    const copied = fireClipboard('copy', container)
    expect(copied.handled).toBe(true)
    expect(decodeURIComponent(copied.text)).toContain('value="Сервис"')

    fireClipboard('paste', container, copied.text)
    fireClipboard('paste', container, copied.text)

    expect(shapes(editor).map((cell) => [cell.getGeometry()!.x, cell.getGeometry()!.y])).toEqual([
      [100, 100],
      [120, 120],
      [140, 140],
    ])
  })

  it('cuts the selection as one undo step', () => {
    const { editor, container } = open()
    editor.graph.setSelectionCell(shape(editor, 100, 100, 'Сервис'))

    const cut = fireClipboard('cut', container)

    expect(cut.handled).toBe(true)
    expect(shapes(editor)).toHaveLength(0)
    editor.undo()
    expect(shapes(editor)).toHaveLength(1)
  })

  it('pastes a fragment of draw.io with its edge, and pastes it further the next time', async () => {
    const { editor, container } = open()

    fireClipboard('paste', container, encodeURIComponent(DRAWIO_FRAGMENT))

    await vi.waitFor(() => expect(shapes(editor)).toHaveLength(2))
    const edges = editor.graph.getDefaultParent().getChildren().filter((cell) => cell.isEdge())
    expect(edges).toHaveLength(1)
    expect(shapes(editor).map((cell) => cell.getValue())).toEqual(['A', 'B'])
    expect(shapes(editor)[0]!.getGeometry()).toMatchObject({ x: 60, y: 60 })
    expect(editor.graph.getSelectionCount()).toBe(3)

    fireClipboard('paste', container, encodeURIComponent(DRAWIO_FRAGMENT))
    expect(shapes(editor)[2]!.getGeometry()).toMatchObject({ x: 80, y: 80 })
  })

  it('pastes other text as a selected text shape with a line per line, as one undo step', async () => {
    const { editor, container } = open()

    fireClipboard('paste', container, 'Платёжный шлюз\r\nверсия 2\nрезерв')

    await vi.waitFor(() => expect(shapes(editor)).toHaveLength(1))
    const [text] = shapes(editor)
    expect(text!.getValue()).toBe('Платёжный шлюз\nверсия 2\nрезерв')
    expect(text!.getStyle()).toMatchObject({ fillColor: 'none', strokeColor: 'none', autosize: true })
    expect(text!.getGeometry()!.height).toBeGreaterThan(50)
    expect(editor.graph.getSelectionCell()).toBe(text)
    editor.undo()
    expect(shapes(editor)).toHaveLength(0)
  })

  it('pastes text with its top-left corner at a point', async () => {
    const { editor } = open()

    editor.paste({ x: 300, y: 200 }, 'Заметка')

    await vi.waitFor(() => expect(shapes(editor)).toHaveLength(1))
    expect(shapes(editor)[0]!.getGeometry()).toMatchObject({ x: 300, y: 200, height: 30 })
  })

  it('pastes nothing for blank text', async () => {
    const { editor, container } = open()

    expect(fireClipboard('paste', container, '  ').handled).toBe(true)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(shapes(editor)).toHaveLength(0)
  })

  it('leaves the clipboard events to the label while it is edited, and to other elements of the page', () => {
    const { editor, container } = open()
    const cell = shape(editor, 0, 0, 'Сервис')
    editor.graph.setSelectionCell(cell)
    const input = document.createElement('input')
    document.body.append(input)

    expect(fireClipboard('copy', input).handled).toBe(false)
    expect(fireClipboard('paste', input, 'текст').handled).toBe(false)

    editor.graph.startEditingAtCell(cell)
    expect(fireClipboard('copy', container).handled).toBe(false)
    expect(fireClipboard('paste', container, 'текст').handled).toBe(false)
    editor.graph.stopEditing(true)
    input.remove()
  })

  it('lets a participant who may only view copy, but not cut or paste', () => {
    const { doc, editor } = open()
    shape(editor, 0, 0, 'Сервис')
    const container = document.createElement('div')
    document.body.append(container)
    const viewer = createDiagramEditor(container, doc, { readOnly: true })
    editors.push(viewer)
    viewer.graph.selectAll()

    expect(fireClipboard('cut', container).handled).toBe(false)
    expect(fireClipboard('paste', container, 'текст').handled).toBe(false)
    expect(fireClipboard('copy', container).handled).toBe(true)
    expect(viewer.graph.getDefaultParent().getChildCount()).toBe(1)
  })
})
