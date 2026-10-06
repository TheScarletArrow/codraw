import {
  Geometry,
  type Cell,
  type ConnectionHandler,
  type SelectionCellsHandler,
  type VertexHandler,
} from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { clipboard } from './clipboard.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { LOCKED_BY_KEY, LOCKED_KEY } from './locks.ts'
import { getCells, initializeDocument } from './model.ts'
import { connect } from './testing.ts'

describe('locked cells', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()))

  function open({ doc = new Y.Doc(), readOnly = false, participantName = 'Алиса' } = {}) {
    if (!readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly, participantName })
    editors.push(editor)
    return { doc, editor }
  }

  function shape(editor: DiagramEditor, x: number, y: number, width = 100): Cell {
    const cell = editor.addShape('rectangle', { x: 0, y: 0 })!
    editor.graph.getDataModel().setGeometry(cell, new Geometry(x, y, width, 60))
    return cell
  }

  /** Selects the cells and locks them. */
  function lock(editor: DiagramEditor, ...cells: Cell[]) {
    editor.graph.setSelectionCells(cells)
    editor.setLocked(true)
  }

  const storedStyle = (doc: Y.Doc, cell: Cell) =>
    (getCells(doc).get(cell.getId()!)!.get('style') as Y.Map<unknown>).toJSON()
  const geometryOf = (cell: Cell) => {
    const { x, y, width, height } = cell.getGeometry()!
    return { x, y, width, height }
  }
  const children = (editor: DiagramEditor) => editor.graph.getDefaultParent().getChildren()

  it('locks the selection in the name of the participant, and the other participant gets it', () => {
    const { doc, editor } = open()
    const other = open({ doc: new Y.Doc(), participantName: 'Боб' })
    connect(doc, other.doc)
    const cell = shape(editor, 100, 100)

    lock(editor, cell)

    expect(storedStyle(doc, cell)).toMatchObject({ [LOCKED_KEY]: true, [LOCKED_BY_KEY]: 'Алиса' })
    expect(editor.getState().lock).toEqual({
      all: true,
      canLock: false,
      locks: [{ cellId: cell.getId(), lockedBy: 'Алиса' }],
    })
    const theirs = other.editor.graph.getDataModel().getCell(cell.getId()!)!
    expect(other.editor.graph.isCellMovable(theirs)).toBe(false)

    // Anybody who edits the board unlocks it.
    other.editor.graph.setSelectionCell(theirs)
    other.editor.setLocked(false)

    expect(storedStyle(doc, cell)).not.toHaveProperty(LOCKED_KEY)
    expect(storedStyle(doc, cell)).not.toHaveProperty(LOCKED_BY_KEY)
    expect(editor.graph.isCellMovable(cell)).toBe(true)
    expect(editor.getState().lock).toEqual({ all: false, canLock: true, locks: [] })
  })

  it('locks and unlocks in one undo step each', () => {
    const { doc, editor } = open()
    const cell = shape(editor, 100, 100)
    editor.graph.setSelectionCell(cell)

    editor.setLocked(true)
    editor.undo()
    expect(storedStyle(doc, cell)).not.toHaveProperty(LOCKED_KEY)
    editor.redo()
    expect(storedStyle(doc, cell)).toMatchObject({ [LOCKED_KEY]: true, [LOCKED_BY_KEY]: 'Алиса' })

    editor.graph.setSelectionCell(editor.graph.getDataModel().getCell(cell.getId()!)!)
    editor.setLocked(false)
    editor.undo()
    expect(storedStyle(doc, cell)).toMatchObject({ [LOCKED_KEY]: true })
  })

  it('selects a locked shape but neither moves, resizes, rotates, edits, connects nor deletes it', () => {
    const { editor } = open()
    const cell = shape(editor, 100, 100)
    const other = shape(editor, 400, 100)
    lock(editor, cell)
    const { graph } = editor

    expect(graph.getSelectionCells()).toEqual([cell])
    expect([graph.isCellMovable(cell), graph.isCellResizable(cell), graph.isCellRotatable(cell)]).toEqual([
      false,
      false,
      false,
    ])
    expect([graph.isCellEditable(cell), graph.isCellDeletable(cell)]).toEqual([false, false])
    expect(graph.getPlugin<ConnectionHandler>('ConnectionHandler')!.isConnectableCell(cell)).toBe(false)
    expect(graph.getPlugin<ConnectionHandler>('ConnectionHandler')!.isConnectableCell(other)).toBe(true)

    editor.moveSelection(10, 0)
    editor.setGeometry({ x: 0, width: 300 })
    editor.editLabel()
    graph.dblClick(new MouseEvent('dblclick'), cell)
    editor.setColor('fill', '#ff0000')
    editor.setFontSize(30)
    editor.setLineStyle({ width: 4 })
    editor.bringToFront()
    editor.deleteSelection()

    expect(graph.isEditing()).toBe(false)
    expect(geometryOf(cell)).toEqual({ x: 100, y: 100, width: 100, height: 60 })
    expect(cell.getStyle()).not.toHaveProperty('fillColor')
    expect(cell.getStyle()).not.toHaveProperty('fontSize', 30)
    expect(cell.getStyle()).not.toHaveProperty('strokeWidth')
    expect(children(editor)).toEqual([cell, other])
  })

  it('connects no edge to a locked shape and moves no end of an edge onto it', () => {
    const { editor } = open()
    const a = shape(editor, 100, 100)
    const b = shape(editor, 400, 100)
    const locked = shape(editor, 700, 100)
    const edge = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: a, target: b })
    lock(editor, locked)
    editor.graph.setSelectionCell(edge)

    const handler = editor.graph.createEdgeHandler(editor.graph.getView().getState(edge)!, null)
    expect(handler.isConnectableCell(locked)).toBe(false)
    expect(handler.isConnectableCell(b)).toBe(true)
    handler.onDestroy()
  })

  it('keeps a locked edge from bending, reversing and changing its markers', () => {
    const { editor } = open()
    const a = shape(editor, 100, 100)
    const b = shape(editor, 400, 100)
    const edge = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: a, target: b })
    lock(editor, edge)

    editor.reverseEdge()
    editor.setEdgeMarker('end', 'none')

    expect(editor.graph.isCellBendable(edge)).toBe(false)
    expect([edge.getTerminal(true), edge.getTerminal(false)]).toEqual([a, b])
    expect(edge.getStyle()).not.toHaveProperty('endArrow')
  })

  it('changes only the unlocked cells of a mixed selection', () => {
    const { editor } = open()
    const locked = shape(editor, 100, 100)
    const free = shape(editor, 300, 100)
    const gone = shape(editor, 500, 100)
    lock(editor, locked)
    editor.graph.setSelectionCells([locked, free])

    expect(editor.getState().lock).toMatchObject({ all: false, canLock: true })
    expect(editor.getState().canGroup).toBe(false)
    editor.setColor('fill', '#ff0000')
    editor.moveSelection(0, 10)
    editor.sendToBack()
    expect(free.getStyle().fillColor).toBe('#ff0000')
    expect(locked.getStyle()).not.toHaveProperty('fillColor')
    expect([geometryOf(locked).y, geometryOf(free).y]).toEqual([100, 110])
    expect(children(editor)[0]).toBe(free)

    editor.graph.setSelectionCells([locked, gone])
    editor.deleteSelection()
    expect(children(editor)).toEqual([free, locked])
  })

  it('aligns the unlocked shapes on the line of all the selected ones and leaves the locked ones in place', () => {
    const { editor } = open()
    const locked = shape(editor, 100, 0)
    const free = shape(editor, 300, 100, 200)
    lock(editor, locked)
    editor.graph.setSelectionCells([free, locked])

    // The middle of the area from 100 to 500.
    editor.alignShapes('center')
    expect([geometryOf(locked).x, geometryOf(free).x]).toEqual([100, 200])

    editor.alignShapes('left')
    expect([geometryOf(locked).x, geometryOf(free).x]).toEqual([100, 100])
  })

  it('distributes the unlocked shapes and leaves the locked ones in place', () => {
    const { editor } = open()
    const shapes = [shape(editor, 0, 0), shape(editor, 150, 0), shape(editor, 200, 0), shape(editor, 700, 0)]
    lock(editor, shapes[1]!)
    editor.graph.setSelectionCells(shapes)

    editor.distributeShapes('horizontal')

    // From 0 to 800: four shapes of 100 and three gaps of 133⅓.
    expect(shapes.map((cell) => Math.round(geometryOf(cell).x))).toEqual([0, 150, 467, 700])
  })

  it('locks a table with its fields from a selected field, and unlocks it from there', () => {
    const { editor } = open()
    const table = editor.addShape('table', { x: 400, y: 100 })!
    const field = table.getChildAt(0)
    lock(editor, field)

    expect(table.getStyle()).toMatchObject({ [LOCKED_KEY]: true })
    expect(field.getStyle()).not.toHaveProperty(LOCKED_KEY)
    expect(editor.getState().lock).toEqual({
      all: true,
      canLock: false,
      locks: [{ cellId: table.getId(), lockedBy: 'Алиса' }],
    })
    const text = field.getValue()
    expect(editor.graph.isCellEditable(field)).toBe(false)
    expect(editor.addTableField()).toBeNull()
    expect(editor.addTableIndex()).toBeNull()
    editor.setFieldProps({ type: 'bigint', primaryKey: true })
    editor.setTableVendor('mysql')
    editor.setBaseTable(true)
    editor.deleteSelection()
    expect(table.getChildCount()).toBe(1)
    expect(field.getValue()).toBe(text)
    expect(table.getStyle()).not.toMatchObject({ dbVendor: 'mysql' })
    expect(table.getStyle()).not.toHaveProperty('codrawBase')

    editor.setLocked(false)
    expect(table.getStyle()).not.toHaveProperty(LOCKED_KEY)
    expect(editor.graph.isCellEditable(field)).toBe(true)
  })

  it('locks the shapes of a locked group, and unlocking one of them unlocks the group', () => {
    const { editor } = open()
    const a = shape(editor, 100, 100)
    const b = shape(editor, 400, 100)
    editor.graph.setSelectionCells([a, b])
    const group = editor.group()!
    editor.setLocked(true)

    editor.graph.setSelectionCell(a)
    expect(editor.graph.isCellMovable(a)).toBe(false)
    expect(editor.getState().lock).toMatchObject({ all: true, locks: [{ cellId: group.getId() }] })
    editor.graph.setSelectionCell(group)
    expect(editor.getState().canUngroup).toBe(false)
    editor.ungroup()
    expect(a.getParent()).toBe(group)

    editor.graph.setSelectionCell(a)
    editor.setLocked(false)
    expect(group.getStyle()).not.toHaveProperty(LOCKED_KEY)
    expect(editor.graph.isCellMovable(a)).toBe(true)
  })

  it('neither deletes nor ungroups a group that holds a locked shape, nor groups a locked shape', () => {
    const { editor } = open()
    const a = shape(editor, 100, 100)
    const b = shape(editor, 400, 100)
    editor.graph.setSelectionCells([a, b])
    const group = editor.group()!
    lock(editor, a)
    const c = shape(editor, 100, 400)

    editor.graph.setSelectionCell(group)
    expect(editor.getState().canUngroup).toBe(false)
    editor.deleteSelection()
    expect(group.getParent()).toBe(editor.graph.getDefaultParent())

    editor.graph.setSelectionCells([group, c])
    expect(editor.getState().canGroup).toBe(true)
    editor.graph.setSelectionCells([a, b])
    expect(editor.getState().canGroup).toBe(false)
  })

  it('makes copies of locked cells that are not locked', () => {
    const { editor } = open()
    const cell = shape(editor, 100, 100)
    lock(editor, cell)

    editor.duplicate()
    const duplicate = editor.graph.getSelectionCell()
    editor.graph.setSelectionCell(cell)
    editor.copy()
    editor.paste()
    const pasted = editor.graph.getSelectionCell()

    for (const copy of [duplicate, pasted]) {
      expect(copy).not.toBe(cell)
      expect(copy.getStyle()).not.toHaveProperty(LOCKED_KEY)
      expect(copy.getStyle()).not.toHaveProperty(LOCKED_BY_KEY)
      expect(editor.graph.isCellMovable(copy)).toBe(true)
    }
    expect(clipboard.text()).not.toContain('locked')
    expect(editor.graph.isCellMovable(cell)).toBe(false)
  })

  it('offers no quick connect from a locked shape', () => {
    const { editor } = open()
    const cell = editor.addShape('service', { x: 100, y: 100 })!
    expect(editor.getState().quickConnect).not.toBeNull()

    editor.setLocked(true)

    expect(editor.getState().quickConnect).toBeNull()
    expect(editor.addConnectedShape('right', 'service')).toBeNull()
    expect(children(editor)).toEqual([cell])
  })

  it('makes new handles for a selected shape when it is locked or unlocked, also by another participant', () => {
    const { editor } = open()
    const cell = shape(editor, 100, 100)
    editor.graph.setSelectionCell(cell)
    const handlers = editor.graph.getPlugin<SelectionCellsHandler>('SelectionCellsHandler')!
    const handles = () => (handlers.getHandler(cell) as VertexHandler).sizers.length
    expect(handles()).toBeGreaterThan(0)

    editor.setLocked(true)
    expect(handles()).toBe(0)

    // As the binding applies the change of another participant.
    editor.graph.getDataModel().setStyle(cell, {})
    expect(handles()).toBeGreaterThan(0)
  })

  it('leaves locked shapes and the shapes of a locked frame where they are in the auto layout', async () => {
    const { editor } = open()
    const frame = editor.addShape('boundary', { x: 0, y: 0 })!
    editor.graph.getDataModel().setGeometry(frame, new Geometry(1000, 1000, 400, 300))
    const inside = shape(editor, 1100, 1100)
    const locked = shape(editor, 0, 0)
    const free = [shape(editor, 500, 500), shape(editor, 200, 800), shape(editor, 900, 100)]
    for (const [source, target] of [
      [free[0]!, free[1]!],
      [free[1]!, free[2]!],
      [locked, free[0]!],
    ]) {
      editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source, target })
    }
    lock(editor, locked, frame)
    editor.graph.clearSelection()
    const before = [frame, inside, locked].map(geometryOf)
    const freeBefore = free.map(geometryOf)

    await editor.autoLayout('right')

    expect([frame, inside, locked].map(geometryOf)).toEqual(before)
    expect(free.map(geometryOf)).not.toEqual(freeBefore)
  })

  it('lets a participant who may only view neither lock nor unlock, but shows the locks', () => {
    const doc = new Y.Doc()
    const owner = open({ doc })
    const cell = shape(owner.editor, 100, 100)
    lock(owner.editor, cell)
    const before = Y.encodeStateVector(doc)
    const { editor } = open({ doc, readOnly: true })

    editor.graph.setSelectionCell(editor.graph.getDataModel().getCell(cell.getId()!)!)
    editor.setLocked(false)

    expect(Y.encodeStateVector(doc)).toEqual(before)
    expect(editor.getState().lock).toEqual({
      all: true,
      canLock: false,
      locks: [{ cellId: cell.getId(), lockedBy: 'Алиса' }],
    })
  })
})
