import { Geometry, type Cell, type CellEditorHandler } from '@maxgraph/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { parseDrawio } from '../drawio/parse.ts'
import { exportDrawio } from '../drawio/serialize.ts'
import { clipboard } from './clipboard.ts'
import { createDiagramEditor, isGroup, type DiagramEditor, type DiagramEditorOptions } from './editor.ts'
import { DEFAULT_PAGE_ID, getCells, initializeDocument, readCell } from './model.ts'
import { addPage } from './pages.ts'
import { STYLE_PARTS, styleClipboard } from './styleCopy.ts'
import { connect } from './testing.ts'

/** The keys that copying a look carries over. */
const CARRIED = Object.values(STYLE_PARTS).flat()

describe('copying and pasting the look of elements', () => {
  const editors: DiagramEditor[] = []
  beforeEach(() => styleClipboard.clear())
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open(doc = new Y.Doc(), options: DiagramEditorOptions = {}) {
    if (!options.readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { participantName: 'Алиса', ...options })
    editors.push(editor)
    return { doc, editor, container }
  }

  function shape(editor: DiagramEditor, x: number, y: number, value = '', id: Parameters<DiagramEditor['addShape']>[0] = 'rectangle') {
    const cell = editor.addShape(id, { x: 0, y: 0 })!
    const model = editor.graph.getDataModel()
    model.setGeometry(cell, new Geometry(x, y, cell.getGeometry()!.width, cell.getGeometry()!.height))
    if (value) model.setValue(cell, value)
    return cell
  }

  /** Styles a shape with the toolbar: blue fill at 60 %, a red dashed line of 3, bold Georgia of 20. */
  function styleSample(editor: DiagramEditor, cell: Cell) {
    editor.graph.setSelectionCell(cell)
    editor.setColor('fill', '#dae8fc')
    editor.setFillOpacity(60)
    editor.setColor('stroke', '#b85450')
    editor.setLineStyle({ width: 3, dash: 'dashed' })
    editor.setFontFamily('Georgia')
    editor.setFontSize(20)
    editor.toggleFontStyle('bold')
  }

  const SAMPLE = {
    fillColor: '#dae8fc',
    fillOpacity: 60,
    strokeColor: '#b85450',
    strokeWidth: 3,
    dashed: true,
    fontFamily: 'Georgia',
    fontSize: 20,
    fontStyle: 1,
  }

  const storedStyle = (doc: Y.Doc, cell: Cell, pageId = DEFAULT_PAGE_ID) =>
    readCell(cell.getId()!, getCells(doc, pageId).get(cell.getId()!)!).style
  const box = (cell: Cell) => {
    const { x, y, width, height } = cell.getGeometry()!
    return { x, y, width, height }
  }

  it('gives the selected shapes the look of the copied one in one undo step, keeping their places, sizes and labels', () => {
    const { doc, editor } = open()
    const sample = shape(editor, 0, 0, 'Образец')
    const b = shape(editor, 200, 0, 'Сервис')
    const c = shape(editor, 400, 0, 'База')
    styleSample(editor, sample)
    const before = [box(b), box(c)]

    editor.graph.setSelectionCell(sample)
    editor.copyStyle()
    editor.graph.setSelectionCells([b, c])
    editor.pasteStyle()

    for (const cell of [b, c]) expect(storedStyle(doc, cell)).toEqual({ codrawShape: 'rectangle', ...SAMPLE })
    expect([box(b), box(c)]).toEqual(before)
    expect([b.getValue(), c.getValue()]).toEqual(['Сервис', 'База'])
    expect(editor.getState().colors).toMatchObject({ fill: '#dae8fc', stroke: '#b85450', fillOpacity: 60 })

    editor.undo()

    for (const cell of [b, c]) expect(storedStyle(doc, cell)).toEqual({ codrawShape: 'rectangle' })
    expect(storedStyle(doc, sample)).toMatchObject(SAMPLE)
  })

  it('shows the pasted look to the other participants', () => {
    const alice = open()
    const bob = open(new Y.Doc())
    connect(alice.doc, bob.doc)
    const sample = shape(alice.editor, 0, 0)
    const target = shape(alice.editor, 200, 0)
    styleSample(alice.editor, sample)

    alice.editor.graph.setSelectionCell(sample)
    alice.editor.copyStyle()
    alice.editor.graph.setSelectionCell(target)
    alice.editor.pasteStyle()

    expect(storedStyle(bob.doc, target)).toMatchObject(SAMPLE)
    expect(bob.editor.graph.getDataModel().getCell(target.getId()!)!.getStyle()).toMatchObject(SAMPLE)
  })

  it('brings back the defaults that the copied element has, and changes nothing else', () => {
    const { doc, editor } = open()
    const plain = shape(editor, 0, 0)
    const note = shape(editor, 200, 0, 'Заметка', 'uml-note')
    editor.graph.setSelectionCell(note)
    editor.setLineStyle({ dash: 'dashed' })
    editor.setRotation(30)

    editor.graph.setSelectionCell(plain)
    editor.copyStyle()
    editor.graph.setSelectionCell(note)
    editor.pasteStyle()

    expect(storedStyle(doc, note)).toEqual({ shape: 'note', codrawShape: 'uml-note', rotation: 30 })
  })

  it('carries the shadow and the gradient over to shapes, and leaves their corners', () => {
    const { doc, editor } = open()
    const sample = shape(editor, 0, 0)
    const rounded = shape(editor, 200, 0, '', 'rounded')
    const plain = shape(editor, 400, 0)
    const edge = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: rounded, target: plain })
    editor.graph.setSelectionCell(sample)
    editor.setShapeEffects({ shadow: true, gradient: '#dae8fc', gradientDirection: 'east' })
    editor.graph.setSelectionCell(rounded)
    editor.setShapeEffects({ arcSize: 30 })

    editor.graph.setSelectionCell(sample)
    editor.copyStyle()
    editor.graph.setSelectionCells([rounded, plain, edge])
    editor.pasteStyle()

    const effects = { shadow: true, gradientColor: '#dae8fc', gradientDirection: 'east' }
    expect(storedStyle(doc, rounded)).toMatchObject({ ...effects, rounded: true, arcSize: 30 })
    expect(storedStyle(doc, plain)).toMatchObject(effects)
    expect(storedStyle(doc, plain)).not.toHaveProperty('rounded')
    expect(storedStyle(doc, edge)).not.toHaveProperty('shadow')
    expect(storedStyle(doc, edge)).not.toHaveProperty('gradientColor')

    // A look without them takes them away.
    editor.graph.setSelectionCell(shape(editor, 600, 0))
    editor.copyStyle()
    editor.graph.setSelectionCell(rounded)
    editor.pasteStyle()
    expect(storedStyle(doc, rounded)).toEqual({ codrawShape: 'rounded', rounded: true, arcSize: 30 })
  })

  it('pastes nothing until a look is copied', () => {
    const { doc, editor } = open()
    const cell = shape(editor, 0, 0)
    editor.graph.setSelectionCell(cell)
    const before = Y.encodeStateVector(doc)

    expect(editor.getState()).toMatchObject({ canCopyStyle: true, canPasteStyle: false })
    editor.pasteStyle()

    expect(Y.encodeStateVector(doc)).toEqual(before)
  })

  it('gives an edge the line and the text only, keeping its markers and its form', () => {
    const { doc, editor } = open()
    const sample = shape(editor, 0, 0)
    const a = shape(editor, 0, 200)
    const b = shape(editor, 300, 200)
    styleSample(editor, sample)
    const edge = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: 'HTTPS', source: a, target: b })
    editor.graph.setSelectionCell(edge)
    editor.setEdgeMarker('end', 'ERmany')
    editor.setLineStyle({ edgeShape: 'curved' })

    editor.graph.setSelectionCell(sample)
    editor.copyStyle()
    editor.graph.setSelectionCell(edge)
    editor.pasteStyle()

    const style = storedStyle(doc, edge)
    expect(style).toMatchObject({ strokeColor: '#b85450', strokeWidth: 3, dashed: true, fontFamily: 'Georgia', fontSize: 20 })
    expect(style).toMatchObject({ endArrow: 'ERmany', curved: true })
    expect(style).not.toHaveProperty('fillColor')
    expect(style).not.toHaveProperty('fillOpacity')
  })

  it('gives a shape the line and the text of an edge, as drawn, and keeps its fill', () => {
    const { doc, editor } = open()
    const a = shape(editor, 0, 0)
    const b = shape(editor, 300, 0)
    const target = shape(editor, 0, 300)
    const edge = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: a, target: b })
    editor.graph.setSelectionCell(edge)
    editor.setColor('stroke', '#0000ff')
    editor.setLineStyle({ dash: 'dotted' })
    editor.graph.setSelectionCell(target)
    editor.setColor('fill', '#fff2cc')

    editor.graph.setSelectionCell(edge)
    editor.copyStyle()
    editor.graph.setSelectionCell(target)
    editor.pasteStyle()

    expect(storedStyle(doc, target)).toEqual({
      codrawShape: 'rectangle',
      fillColor: '#fff2cc',
      strokeColor: '#0000ff',
      dashed: true,
      dashPattern: '1 2',
      // Text of edges is smaller by default.
      fontSize: 11,
    })
  })

  it('gives a text the look of the text only, and takes only the text from it', () => {
    const { doc, editor } = open()
    const sample = shape(editor, 0, 0)
    const text = shape(editor, 0, 200, '', 'text')
    const box = shape(editor, 300, 0)
    styleSample(editor, sample)

    editor.graph.setSelectionCell(sample)
    editor.copyStyle()
    editor.graph.setSelectionCell(text)
    editor.pasteStyle()

    expect(storedStyle(doc, text)).toMatchObject({ fillColor: 'none', strokeColor: 'none', fontFamily: 'Georgia', fontSize: 20 })
    expect(storedStyle(doc, text)).not.toHaveProperty('dashed')

    editor.graph.setSelectionCell(box)
    editor.setColor('fill', '#fff2cc')
    editor.graph.setSelectionCell(text)
    editor.copyStyle()
    editor.graph.setSelectionCell(box)
    editor.pasteStyle()

    expect(storedStyle(doc, box)).toEqual({
      codrawShape: 'rectangle',
      fillColor: '#fff2cc',
      fontFamily: 'Georgia',
      fontSize: 20,
      fontStyle: 1,
    })
  })

  it('gives a table the look of a shape, and its fields the font and the size with their heights', () => {
    const { doc, editor } = open()
    const sample = shape(editor, 0, 0)
    editor.graph.setSelectionCell(sample)
    editor.setColor('fill', '#dae8fc')
    editor.setFontFamily('Courier New')
    editor.setFontSize(16)
    const table = editor.addShape('table', { x: 400, y: 100 })!
    const field = table.getChildAt(0)

    editor.graph.setSelectionCell(sample)
    editor.copyStyle()
    editor.graph.setSelectionCell(table)
    editor.pasteStyle()

    // The name is not bold any more, like the copied shape, and the header fits the larger text.
    expect(storedStyle(doc, table)).toMatchObject({ fillColor: '#dae8fc', fontFamily: 'Courier New', fontSize: 16, startSize: 34 })
    expect(storedStyle(doc, table)).not.toHaveProperty('fontStyle')
    expect(storedStyle(doc, field)).toMatchObject({ fillColor: 'none', align: 'left', fontFamily: 'Courier New', fontSize: 16 })
    expect(field.getGeometry()!.height).toBe(30)

    editor.undo()

    expect(storedStyle(doc, table)).toMatchObject({ fontStyle: 1, startSize: 30 })
    expect(storedStyle(doc, field)).not.toHaveProperty('fontFamily')
    expect(field.getGeometry()!.height).toBe(26)
  })

  it('gives a selected field the whole text of the look', () => {
    const { doc, editor } = open()
    const sample = shape(editor, 0, 0)
    styleSample(editor, sample)
    const table = editor.addShape('table', { x: 400, y: 100 })!
    const field = table.getChildAt(0)

    editor.graph.setSelectionCell(sample)
    editor.copyStyle()
    editor.graph.setSelectionCell(field)
    editor.pasteStyle()

    expect(storedStyle(doc, field)).toMatchObject({ fillColor: 'none', strokeColor: 'none', fontStyle: 1, fontSize: 20 })
    expect(storedStyle(doc, field)).not.toHaveProperty('align')
    expect(storedStyle(doc, table)).toMatchObject({ fontStyle: 1, fillColor: '#eef2f6' })
  })

  it('gives the shapes and edges of a group the look, and leaves the group a group', () => {
    const { doc, editor } = open()
    const sample = shape(editor, 0, 0)
    styleSample(editor, sample)
    const a = shape(editor, 0, 200)
    const b = shape(editor, 300, 200)
    const edge = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: a, target: b })
    editor.graph.setSelectionCells([a, b, edge])
    const group = editor.group()!

    expect(editor.getState()).toMatchObject({ canCopyStyle: false })
    editor.graph.setSelectionCell(sample)
    editor.copyStyle()
    editor.graph.setSelectionCell(group)
    expect(editor.getState()).toMatchObject({ canCopyStyle: false, canPasteStyle: true })
    editor.pasteStyle()

    expect(storedStyle(doc, a)).toMatchObject(SAMPLE)
    expect(storedStyle(doc, b)).toMatchObject(SAMPLE)
    expect(storedStyle(doc, edge)).toMatchObject({ strokeColor: '#b85450', fontFamily: 'Georgia' })
    expect(storedStyle(doc, group)).toMatchObject({ fillColor: 'none', strokeColor: 'none' })
    expect(isGroup(group)).toBe(true)
  })

  it('copies the look of a single element only', () => {
    const { editor } = open()
    const a = shape(editor, 0, 0)
    const b = shape(editor, 200, 0)

    editor.graph.setSelectionCells([a, b])
    expect(editor.getState().canCopyStyle).toBe(false)
    editor.copyStyle()

    expect(styleClipboard.read()).toBeNull()
  })

  it('leaves locked elements as they are and copies their look', () => {
    const { doc, editor } = open()
    const sample = shape(editor, 0, 0)
    const locked = shape(editor, 200, 0)
    const free = shape(editor, 400, 0)
    styleSample(editor, sample)
    editor.graph.setSelectionCell(sample)
    editor.setLocked(true)

    expect(editor.getState().canCopyStyle).toBe(true)
    editor.copyStyle()
    editor.graph.setSelectionCell(locked)
    editor.setLocked(true)
    expect(editor.getState().canPasteStyle).toBe(false)
    editor.graph.setSelectionCells([locked, free])
    expect(editor.getState().canPasteStyle).toBe(true)
    editor.pasteStyle()

    expect(storedStyle(doc, free)).toMatchObject(SAMPLE)
    expect(storedStyle(doc, locked)).not.toHaveProperty('fillColor')
  })

  it('lets a participant who may only view copy a look and paste it on a board of their own', () => {
    const owner = open()
    const sample = shape(owner.editor, 0, 0)
    const other = shape(owner.editor, 200, 0)
    styleSample(owner.editor, sample)
    const viewer = open(owner.doc, { readOnly: true })
    const before = Y.encodeStateVector(owner.doc)

    viewer.editor.graph.setSelectionCell(viewer.editor.graph.getDataModel().getCell(sample.getId()!)!)
    viewer.editor.copyStyle()
    viewer.editor.graph.setSelectionCell(viewer.editor.graph.getDataModel().getCell(other.getId()!)!)
    expect(viewer.editor.getState()).toMatchObject({ canCopyStyle: true, canPasteStyle: false })
    viewer.editor.pasteStyle()
    expect(Y.encodeStateVector(owner.doc)).toEqual(before)

    const own = open()
    const target = shape(own.editor, 0, 0)
    own.editor.graph.setSelectionCell(target)
    expect(own.editor.getState().canPasteStyle).toBe(true)
    own.editor.pasteStyle()

    expect(storedStyle(own.doc, target)).toMatchObject(SAMPLE)
  })

  it('pastes a look copied on another page of the tab', () => {
    const first = open()
    const sample = shape(first.editor, 0, 0)
    styleSample(first.editor, sample)
    first.editor.graph.setSelectionCell(sample)
    first.editor.copyStyle()
    const pageId = addPage(first.doc)
    first.editor.destroy()
    editors.splice(editors.indexOf(first.editor), 1)

    const second = open(first.doc, { pageId })
    const target = shape(second.editor, 0, 0)
    second.editor.graph.setSelectionCell(target)
    second.editor.pasteStyle()

    expect(storedStyle(first.doc, target, pageId)).toMatchObject(SAMPLE)
  })

  it('writes the look into a file of draw.io as the copied element has it', async () => {
    const { doc, editor } = open()
    const sample = shape(editor, 0, 0)
    const target = shape(editor, 200, 0, '', 'ellipse')
    styleSample(editor, sample)
    editor.graph.setSelectionCell(sample)
    editor.copyStyle()
    editor.graph.setSelectionCell(target)
    editor.pasteStyle()

    const [page] = await parseDrawio(exportDrawio(doc))
    const styleOf = (cell: Cell) => page!.cells.find((parsed) => parsed.id === cell.getId())!.style
    const carried = (style: Record<string, unknown>) => Object.fromEntries(CARRIED.map((key) => [key, style[key]]))

    expect(carried(styleOf(target))).toEqual(carried(styleOf(sample)))
    expect(styleOf(target)).toMatchObject({ shape: 'ellipse' })
  })

  describe('keys', () => {
    /** Presses a key on the canvas as the browser reports it, e.g. `с` of the Russian layout on the key C. */
    function press(target: EventTarget, key: string, code: string, init: KeyboardEventInit = {}) {
      const event = new KeyboardEvent('keydown', { key, code, ctrlKey: true, altKey: true, bubbles: true, cancelable: true, ...init })
      target.dispatchEvent(event)
      return event
    }

    it('copy and paste a look with Ctrl+Alt+C and Ctrl+Alt+V in the Russian layout, and with Option on macOS', () => {
      const { doc, editor, container } = open()
      const sample = shape(editor, 0, 0)
      const target = shape(editor, 200, 0)
      styleSample(editor, sample)
      editor.graph.setSelectionCell(sample)
      editor.copy()
      const copied = clipboard.read()

      const copy = press(container, 'с', 'KeyC')
      editor.graph.setSelectionCell(target)
      const paste = press(container, 'м', 'KeyV')

      expect(storedStyle(doc, target)).toMatchObject(SAMPLE)
      expect([copy.defaultPrevented, paste.defaultPrevented]).toEqual([true, true])
      // Neither the clipboard nor the canvas got anything: no copy and no paste of cells.
      expect(clipboard.read()).toBe(copied)
      expect(editor.graph.getDefaultParent().getChildCount()).toBe(2)
      // C alone turns the comment tool on; with Ctrl and Alt it does not.
      expect(editor.getState().commentTool).toBe(false)

      editor.undo()
      expect(storedStyle(doc, target)).not.toHaveProperty('fillColor')
      styleClipboard.clear()
      // Option on macOS types other characters on the keys.
      editor.graph.setSelectionCell(sample)
      press(container, 'ç', 'KeyC')
      editor.graph.setSelectionCell(target)
      press(container, '√', 'KeyV')
      expect(storedStyle(doc, target)).toMatchObject(SAMPLE)
    })

    it('do nothing with Shift or without Ctrl, nor while a label is edited', () => {
      const { doc, editor, container } = open()
      const sample = shape(editor, 0, 0)
      const target = shape(editor, 200, 0, 'Подпись')
      styleSample(editor, sample)
      editor.graph.setSelectionCell(sample)

      press(container, 'C', 'KeyC', { shiftKey: true })
      press(container, 'ç', 'KeyC', { ctrlKey: false })
      expect(styleClipboard.read()).toBeNull()

      press(container, 'c', 'KeyC')
      editor.graph.setSelectionCell(target)
      editor.graph.startEditingAtCell(target)
      press(editor.graph.getPlugin<CellEditorHandler>('CellEditorHandler')!.textarea!, 'v', 'KeyV')
      editor.graph.stopEditing(true)

      expect(storedStyle(doc, target)).not.toHaveProperty('fillColor')
    })

    it('only copy a look for a participant who may only view', () => {
      const owner = open()
      const sample = shape(owner.editor, 0, 0)
      const other = shape(owner.editor, 200, 0)
      styleSample(owner.editor, sample)
      const before = Y.encodeStateVector(owner.doc)
      const viewer = open(owner.doc, { readOnly: true })
      const graph = viewer.editor.graph

      graph.setSelectionCell(graph.getDataModel().getCell(sample.getId()!)!)
      press(viewer.container, 'c', 'KeyC')
      graph.setSelectionCell(graph.getDataModel().getCell(other.getId()!)!)
      const paste = press(viewer.container, 'v', 'KeyV')

      expect(styleClipboard.read()?.values).toMatchObject({ fillColor: '#dae8fc' })
      expect(paste.defaultPrevented).toBe(false)
      expect(Y.encodeStateVector(owner.doc)).toEqual(before)
    })
  })
})
