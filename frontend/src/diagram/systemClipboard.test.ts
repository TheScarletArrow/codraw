import { Geometry, type Cell, type CellStyle } from '@maxgraph/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { DiagramBuilder } from '../templates/builder.ts'
import { clipboard } from './clipboard.ts'
import { clipboardContent, clipboardText, dataToCells, readClipboardText } from './clipboardFormat.ts'
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

/** Fires a clipboard event at `target` with a clipboard that holds `text` and `html`; returns what the handler wrote. */
function fireClipboard(type: 'copy' | 'cut' | 'paste', target: EventTarget, text = '', html = '') {
  const data = new Map([
    ['text/plain', text],
    ['text/html', html],
  ])
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: { setData: (kind: string, value: string) => data.set(kind, value), getData: (kind: string) => data.get(kind) ?? '' },
  })
  target.dispatchEvent(event)
  return { handled: event.defaultPrevented, text: data.get('text/plain') ?? '', html: data.get('text/html') ?? '' }
}

/** Cells of tables `users` and `boards` with an edge from `boards.owner_id` to `users.id`, and of a rectangle. */
function schemaCells() {
  const builder = new DiagramBuilder()
  const users = builder.table('users', 0, 0, ['id uuid PK', 'email text NOT NULL'])
  const boards = builder.table('boards', 300, 0, ['id uuid PK', 'owner_id uuid NOT NULL'])
  builder.edge(boards.fields[1]!, users.fields[0]!)
  const rectangle = builder.shape('rectangle', 600, 0, { value: 'Сервис' })
  const cells = builder.build()
  return { cells, rectangle, tables: cells.filter((cell) => cell.id !== rectangle) }
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

  it('keeps the indexes of a copied table', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const doc = new Y.Doc()
    initializeDocument(doc)
    const editor = createDiagramEditor(container, doc)
    const table = editor.addShape('table', { x: 100, y: 100 })!
    editor.graph.setSelectionCell(table)
    editor.graph.labelChanged(editor.addTableIndex()!, 'users_id_idx (id)', null as never)

    const text = clipboardText(editor.graph.cloneCells([table], false))
    editor.destroy()

    const content = await readClipboardText(text)
    const [pasted] = content?.kind === 'cells' ? content.cells : []
    expect(pasted!.getChildAt(1).getValue()).toBe('users_id_idx (id)')
    expect(pasted!.getChildAt(1).getStyle()).toMatchObject({ codrawIndex: true })
  })

  it('writes tables alone as SQL with the cells in the HTML, and reads the cells back from the HTML', async () => {
    const { tables } = schemaCells()
    const { text, html } = clipboardContent(dataToCells(tables))

    expect(text).toContain('CREATE TABLE users (\n    id uuid PRIMARY KEY,\n    email text NOT NULL\n);')
    expect(text).toContain('ALTER TABLE boards ADD FOREIGN KEY (owner_id) REFERENCES users (id);')
    expect(html).toMatch(/^<meta charset="utf-8"><pre data-codraw="%3CmxGraphModel%3E[^"]*">CREATE TABLE users/)
    const content = await readClipboardText(text, html!)
    expect(content?.kind).toBe('cells')
    const cells = content?.kind === 'cells' ? content.cells : []
    expect(cells.filter((cell) => cell.isVertex()).map((cell) => [cell.getValue(), (cell.getStyle() as Record<string, unknown>).dbVendor])).toEqual([
      ['users', 'postgresql'],
      ['boards', 'postgresql'],
    ])
    expect(cells.find((cell) => cell.isEdge())!.getTerminal(true)!.getValue()).toBe('owner_id uuid NOT NULL')
  })

  it('writes anything but tables alone, and base tables alone, in the format of draw.io without HTML', () => {
    const { cells, tables } = schemaCells()
    const mixed = clipboardContent(dataToCells(cells))
    expect(decodeURIComponent(mixed.text)).toContain('value="Сервис"')
    expect(mixed.html).toBeNull()

    const builder = new DiagramBuilder()
    builder.table('A & B < C', 0, 0, ['id uuid PK'])
    expect(clipboardContent(dataToCells(builder.build())).html).toContain('>CREATE TABLE "A &amp; B &lt; C" (')

    const base = tables.filter((cell) => cell.value === 'users' || cell.parent === tables.find((table) => table.value === 'users')!.id)
    base[0]!.style.codrawBase = true
    expect(clipboardContent(dataToCells(base)).html).toBeNull()
  })

  it('reads DDL with tables as a laid out diagram, and text that only has SQL words as text', async () => {
    const content = await readClipboardText('CREATE TABLE users (id uuid PRIMARY KEY, email text NOT NULL);')
    expect(content?.kind).toBe('diagram')
    const cells = content?.kind === 'diagram' ? content.cells : []
    expect(cells[0]!.getValue()).toBe('users')
    expect(cells[0]!.getChildren().map((field) => field.getValue())).toEqual(['id uuid PK', 'email text NOT NULL'])

    expect(await readClipboardText('create table для заказов')).toEqual({ kind: 'text', text: 'create table для заказов' })
    expect(await readClipboardText('просто текст', '<p data-codraw="нечто">просто текст</p>')).toEqual({ kind: 'text', text: 'просто текст' })
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

  it('copies tables as SQL with their cells in the HTML, which another board pastes as the same tables', async () => {
    const { editor, container } = open()
    editor.insertCells(schemaCells().tables)
    const tables = shapes(editor)
    editor.graph.getDataModel().setStyle(tables[0]!, { ...tables[0]!.getStyle(), fontFamily: 'Courier New', dbVendor: 'mysql' } as CellStyle)
    editor.graph.setSelectionCells(tables)

    const copied = fireClipboard('copy', container)
    expect(copied.text).toMatch(/^CREATE TABLE users/)
    expect(copied.html).toContain('data-codraw="%3CmxGraphModel%3E')

    // Another tab has its own clipboard: the cells come from the HTML.
    clipboard.put([], 'другая вкладка')
    const other = open()
    fireClipboard('paste', other.container, copied.text, copied.html)
    await vi.waitFor(() => expect(shapes(other.editor)).toHaveLength(2))
    const [users] = shapes(other.editor)
    expect(users!.getStyle()).toMatchObject({ fontFamily: 'Courier New', dbVendor: 'mysql' })
    expect(users!.getGeometry()!.x).toBe(20)
    other.editor.undo()
    expect(shapes(other.editor)).toHaveLength(0)
  })

  it('pastes DDL from another program as laid out tables in the middle of the visible area, as one undo step', async () => {
    const { editor, container } = open()

    fireClipboard('paste', container, 'CREATE TABLE users (id uuid PRIMARY KEY);\nCREATE TABLE boards (owner_id uuid REFERENCES users);')

    await vi.waitFor(() => expect(shapes(editor)).toHaveLength(2))
    expect(shapes(editor).map((cell) => cell.getValue())).toEqual(['users', 'boards'])
    expect(editor.graph.getDefaultParent().getChildren().filter((cell) => cell.isEdge())).toHaveLength(1)
    expect(editor.graph.getSelectionCells()).toHaveLength(3)
    editor.undo()
    expect(shapes(editor)).toHaveLength(0)
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

  it('pastes a flowchart of Mermaid as a laid out diagram, as one undo step', async () => {
    const { editor, container } = open()

    fireClipboard('paste', container, 'flowchart LR\n  client[Клиент] -->|HTTPS| api(API)\n  api --> db[(PostgreSQL)]')

    await vi.waitFor(() => expect(shapes(editor)).toHaveLength(3))
    const [client, api, db] = shapes(editor)
    expect([client, api, db].map((cell) => cell!.getValue())).toEqual(['Клиент', 'API', 'PostgreSQL'])
    expect(client!.getGeometry()!.x).toBeLessThan(api!.getGeometry()!.x)
    expect(api!.getGeometry()!.x).toBeLessThan(db!.getGeometry()!.x)
    const edges = editor.graph.getDefaultParent().getChildren().filter((cell) => cell.isEdge())
    expect(edges.map((edge) => [edge.getTerminal(true), edge.getTerminal(false), edge.getValue()])).toEqual([
      [client, api, 'HTTPS'],
      [api, db, ''],
    ])
    editor.undo()
    expect(shapes(editor)).toHaveLength(0)
  })

  it('pastes a diagram of Mermaid with its top-left corner at a point, and other kinds of Mermaid as text', async () => {
    const { editor } = open()

    editor.paste({ x: 300, y: 200 }, 'graph TD\n  a --> b')
    await vi.waitFor(() => expect(shapes(editor)).toHaveLength(2))
    expect(Math.min(...shapes(editor).map((cell) => cell.getGeometry()!.x))).toBe(300)
    expect(Math.min(...shapes(editor).map((cell) => cell.getGeometry()!.y))).toBe(200)

    editor.paste(undefined, 'sequenceDiagram\n  A->>B: hi')
    await vi.waitFor(() => expect(shapes(editor)).toHaveLength(3))
    expect(shapes(editor)[2]!.getValue()).toBe('sequenceDiagram\n  A->>B: hi')
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
