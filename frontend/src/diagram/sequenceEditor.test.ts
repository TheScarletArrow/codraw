import type { Cell, CellEditorHandler, SelectionHandler } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { getCells, initializeDocument, readCell } from './model.ts'
import {
  ACTIVATE_KEY,
  ARROW_KEY,
  DEACTIVATE_KEY,
  FROM_KEY,
  PARTICIPANT_KEY,
  PARTICIPANT_KIND_KEY,
  SEQUENCE_SHAPE,
  TO_KEY,
} from './sequence.ts'
import { partOf, sequenceLayoutOf } from './sequenceShapes.ts'
import { connect } from './testing.ts'

describe('sequence diagrams in the editor', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    document.body.replaceChildren()
  })

  function open({ doc = new Y.Doc(), readOnly = false } = {}) {
    if (!readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly, participantName: 'Алиса', participantId: 'alice' })
    editors.push(editor)
    return { doc, editor }
  }

  const diagramOf = (editor: DiagramEditor) =>
    editor.graph
      .getDefaultParent()
      .getChildren()
      .find((cell) => cell.getStyle().shape === SEQUENCE_SHAPE)!
  const parts = (diagram: Cell, kind: string) => diagram.getChildren().filter((child) => partOf(child) === kind)
  const values = (diagram: Cell, kind: string) => parts(diagram, kind).map((cell) => String(cell.getValue() ?? ''))
  const ys = (diagram: Cell, kind: string) => parts(diagram, kind).map((cell) => cell.getGeometry()!.y)
  const textarea = (editor: DiagramEditor) => editor.graph.getPlugin<CellEditorHandler>('CellEditorHandler')!.textarea!
  const type = (editor: DiagramEditor, text: string, key = 'Enter', init: KeyboardEventInit = {}) => {
    textarea(editor).textContent = text
    const codes: Record<string, number> = { Enter: 13, Escape: 27 }
    textarea(editor).dispatchEvent(new KeyboardEvent('keydown', { key, keyCode: codes[key], bubbles: true, cancelable: true, ...init }))
  }

  function newDiagram(editor: DiagramEditor) {
    editor.addShape('sequence', { x: 300, y: 300 })
    return diagramOf(editor)
  }

  it('adds a diagram of two participants, a call and its answer from the palette as one undo step', () => {
    const { doc, editor } = open()
    const other = open({ doc: new Y.Doc() })
    connect(doc, other.doc)

    const diagram = newDiagram(editor)

    expect(diagram.getValue()).toBe('Сценарий')
    expect(values(diagram, 'participant')).toEqual(['Клиент', 'Сервис'])
    expect(values(diagram, 'message')).toEqual(['Запрос', 'Ответ'])
    const [request, answer] = parts(diagram, 'message')
    expect(answer!.getGeometry()!.y).toBeGreaterThan(request!.getGeometry()!.y)
    expect(answer!.getStyle()[ARROW_KEY as never]).toBe('reply')
    // The diagram is as large as its parts.
    expect(diagram.getGeometry()!.height).toBe(sequenceLayoutOf(diagram).height)
    expect(values(diagramOf(other.editor), 'message')).toEqual(['Запрос', 'Ответ'])
    expect(editor.getState().sequence).toMatchObject({ diagramId: diagram.getId(), numbered: false, part: null, canChange: true })

    editor.undo()
    expect(editor.graph.getDefaultParent().getChildCount()).toBe(0)
    expect(other.editor.graph.getDefaultParent().getChildCount()).toBe(0)
  })

  it('inserts a message under the selected one, moving the rows under it down, as one undo step', () => {
    const { editor } = open()
    const diagram = newDiagram(editor)
    const [request, answer] = parts(diagram, 'message')
    const before = answer!.getGeometry()!.y
    editor.graph.stopEditing(false)
    editor.graph.setSelectionCell(request!)

    const added = editor.addSequenceMessage()!
    type(editor, 'Проверка', 'Tab')
    editor.graph.stopEditing(false)

    expect(values(diagram, 'message')).toEqual(['Запрос', 'Проверка', 'Ответ'])
    expect(added.getGeometry()!.y).toBe(before)
    expect(answer!.getGeometry()!.y).toBeGreaterThan(before)
    // Between the participants of the selected message.
    expect(added.getStyle()[FROM_KEY as never]).toBe(request!.getStyle()[FROM_KEY as never])
    expect(added.getStyle()[TO_KEY as never]).toBe(request!.getStyle()[TO_KEY as never])
    // The text written joins the step that added the message.
    editor.undo()
    expect(values(diagram, 'message')).toEqual(['Запрос', 'Ответ'])
    expect(answer!.getGeometry()!.y).toBe(before)
  })

  it('adds the next message with Enter, and a new message left empty goes without an undo step', () => {
    const { editor } = open()
    const diagram = newDiagram(editor)
    const [request] = parts(diagram, 'message')
    editor.graph.setSelectionCell(request!)
    editor.graph.startEditingAtCell(request!)

    type(editor, 'Логин')
    type(editor, 'Проверка')
    type(editor, 'Токен')
    type(editor, '', 'Escape')

    expect(values(diagram, 'message')).toEqual(['Логин', 'Проверка', 'Токен', 'Ответ'])
    expect(editor.getState().canRedo).toBe(false)
    expect(editor.graph.isEditing()).toBe(false)
    // The message written last is selected again, and the tools of the diagram stay.
    expect(editor.graph.getSelectionCells().map((cell) => cell.getValue())).toEqual(['Токен'])
    expect(editor.getState().sequence?.part?.type).toBe('message')
    editor.undo()
    expect(values(diagram, 'message')).toEqual(['Логин', 'Проверка', 'Ответ'])
    editor.undo()
    editor.undo()
    expect(values(diagram, 'message')).toEqual(['Запрос', 'Ответ'])
  })

  it('breaks the line of a message with Shift+Enter', () => {
    const { editor } = open()
    const diagram = newDiagram(editor)
    const [request] = parts(diagram, 'message')
    editor.graph.startEditingAtCell(request!)
    type(editor, 'Запрос', 'Enter', { shiftKey: true })
    expect(editor.graph.isEditing()).toBe(true)
    expect(values(diagram, 'message')).toHaveLength(2)
  })

  it('reads a message written as a line of Mermaid, adding a participant it names', () => {
    const { editor } = open()
    const diagram = newDiagram(editor)
    const [request] = parts(diagram, 'message')
    editor.graph.startEditingAtCell(request!)
    type(editor, 'API-->>-Клиент: 200 OK', 'Tab')
    editor.graph.stopEditing(false)

    expect(values(diagram, 'participant')).toEqual(['Клиент', 'Сервис', 'API'])
    const [client, , api] = parts(diagram, 'participant').map((cell) => cell.getStyle()[PARTICIPANT_KEY as never])
    expect(request!.getValue()).toBe('200 OK')
    expect(request!.getStyle()).toMatchObject({ [FROM_KEY]: api, [TO_KEY]: client, [ARROW_KEY]: 'reply', [DEACTIVATE_KEY]: [api] })
  })

  it('removes a participant with its messages, and a frame with its branches but not its rows, in one step', () => {
    const { editor } = open()
    const diagram = newDiagram(editor)
    const [, service] = parts(diagram, 'participant')
    const [, answer] = parts(diagram, 'message')
    editor.graph.setSelectionCell(answer!)
    editor.addSequenceFrame('alt')
    editor.graph.stopEditing(false)
    editor.addSequenceBranch()
    editor.graph.stopEditing(false)
    expect(parts(diagram, 'frame')).toHaveLength(1)
    expect(parts(diagram, 'else')).toHaveLength(1)
    expect(parts(diagram, 'end')).toHaveLength(1)

    editor.graph.setSelectionCell(parts(diagram, 'frame')[0]!)
    editor.deleteSelection()
    expect(parts(diagram, 'frame')).toHaveLength(0)
    expect(parts(diagram, 'else')).toHaveLength(0)
    expect(parts(diagram, 'end')).toHaveLength(0)
    expect(values(diagram, 'message')).toEqual(['Запрос', 'Ответ'])

    editor.graph.setSelectionCell(service!)
    editor.deleteSelection()
    expect(values(diagram, 'participant')).toEqual(['Клиент'])
    expect(values(diagram, 'message')).toEqual([])
    editor.undo()
    expect(values(diagram, 'participant')).toEqual(['Клиент', 'Сервис'])
    expect(values(diagram, 'message')).toEqual(['Запрос', 'Ответ'])
  })

  it('frames the selected rows, a frame among them whole, and puts the end after the last one', () => {
    const { editor } = open()
    const diagram = newDiagram(editor)
    const [request, answer] = parts(diagram, 'message')
    editor.graph.setSelectionCell(request!)
    editor.addSequenceFrame('loop')
    type(editor, 'каждую минуту', 'Tab')
    editor.graph.stopEditing(false)
    const loop = parts(diagram, 'frame')[0]!
    expect(loop.getValue()).toBe('каждую минуту')
    const order = () => diagram.getChildren().filter((child) => partOf(child) !== 'participant').map((child) => partOf(child))
    expect(order()).toEqual(['frame', 'message', 'end', 'message'])

    editor.graph.setSelectionCells([loop, answer!])
    editor.addSequenceFrame('opt')
    editor.graph.stopEditing(false)
    expect(order()).toEqual(['frame', 'frame', 'message', 'end', 'message', 'end'])
    const layout = sequenceLayoutOf(diagram)
    const outer = layout.steps.get(parts(diagram, 'frame')[0]!.getId()!)!.box
    const inner = layout.steps.get(loop.getId()!)!.box
    expect(inner.x).toBeGreaterThan(outer.x)
    expect(inner.y).toBeGreaterThan(outer.y)
  })

  it('changes the kind of a participant and the participants, the kind and the activations of a message', () => {
    const { editor } = open()
    const diagram = newDiagram(editor)
    const [client, service] = parts(diagram, 'participant')
    const [request] = parts(diagram, 'message')
    const keyOf = (cell: Cell) => cell.getStyle()[PARTICIPANT_KEY as never] as string

    editor.setSequenceParticipant(client!.getId()!, { kind: 'actor' })
    expect(client!.getStyle()[PARTICIPANT_KIND_KEY as never]).toBe('actor')
    editor.setSequenceMessage(request!.getId()!, { activates: true, arrow: 'async' })
    expect(request!.getStyle()).toMatchObject({ [ACTIVATE_KEY]: [keyOf(service!)], [ARROW_KEY]: 'async' })
    // A new receiver takes over the activation.
    editor.setSequenceMessage(request!.getId()!, { to: keyOf(client!) })
    expect(request!.getStyle()).toMatchObject({ [TO_KEY]: keyOf(client!), [ACTIVATE_KEY]: [keyOf(client!)] })

    editor.graph.setSelectionCell(request!)
    expect(editor.getState().sequence?.part).toEqual({
      type: 'message',
      cellId: request!.getId(),
      from: keyOf(client!),
      to: keyOf(client!),
      arrow: 'async',
      activates: true,
      deactivates: false,
    })
    editor.undo()
    expect(request!.getStyle()[TO_KEY as never]).toBe(keyOf(service!))
  })

  it('numbers the messages of a diagram in their labels, not in their text', () => {
    const { editor } = open()
    const diagram = newDiagram(editor)
    editor.setSequenceNumbering(diagram.getId()!, true)
    const [request, answer] = parts(diagram, 'message')
    expect(editor.graph.getLabel(request!)).toBe('1. Запрос')
    expect(editor.graph.getLabel(answer!)).toBe('2. Ответ')
    expect(request!.getValue()).toBe('Запрос')
    expect(editor.graph.getLabel(diagram)).toBe('sd Сценарий')
  })

  it('moves a dragged participant among the participants and a message among the rows', () => {
    const { editor } = open()
    const diagram = newDiagram(editor)
    const [client, service] = parts(diagram, 'participant')
    const [request, answer] = parts(diagram, 'message')
    const view = editor.graph.getView()
    // What maxGraph does when a dragged part is dropped: it moves it, and the layout of its diagram hears where.
    const handler = editor.graph.getPlugin<SelectionHandler>('SelectionHandler')!
    const drop = (cell: Cell, x: number, y: number) => {
      handler.cell = cell
      handler.moveCells([cell], 1, 1, false, null, new MouseEvent('mouseup', { clientX: x, clientY: y }))
    }
    // Dropped left of the client.
    const clientState = view.getState(client!)!
    drop(service!, clientState.x - 5, clientState.y + 10)
    expect(values(diagram, 'participant')).toEqual(['Сервис', 'Клиент'])
    // Dropped above the request.
    const requestState = view.getState(request!)!
    drop(answer!, requestState.x + 5, requestState.y - 2)
    expect(values(diagram, 'message')).toEqual(['Ответ', 'Запрос'])
    editor.undo()
    expect(values(diagram, 'message')).toEqual(['Запрос', 'Ответ'])

    // Dropped outside the diagram, below it and right of it: still parts of it, last.
    const diagramState = view.getState(diagram)!
    drop(request!, diagramState.x + 20, diagramState.y + diagramState.height + 40)
    expect(request!.getParent()).toBe(diagram)
    expect(values(diagram, 'message')).toEqual(['Ответ', 'Запрос'])
    drop(service!, diagramState.x + diagramState.width + 40, clientState.y + 10)
    expect(service!.getParent()).toBe(diagram)
    expect(values(diagram, 'participant')).toEqual(['Клиент', 'Сервис'])
  })

  it('shows no condition of a branch whose frame another participant took away', () => {
    const { doc, editor } = open()
    const diagram = newDiagram(editor)
    const [, answer] = parts(diagram, 'message')
    editor.graph.setSelectionCell(answer!)
    editor.addSequenceFrame('alt')
    editor.graph.stopEditing(false)
    editor.addSequenceBranch()
    type(editor, 'ошибка', 'Tab')
    editor.graph.stopEditing(false)
    const branch = parts(diagram, 'else')[0]!
    expect(editor.graph.getLabel(branch)).toBe('[ошибка]')

    // As when the participant who added the frame undoes it: its frame and its end go, the branch of another stays.
    doc.transact(() => {
      for (const kind of ['frame', 'end']) getCells(doc).delete(parts(diagram, kind)[0]!.getId()!)
    }, 'remote')
    expect(parts(diagram, 'else')).toEqual([branch])
    expect(editor.graph.getLabel(branch)).toBe('')
  })

  it('puts a message dropped under the tab of a frame into the frame', () => {
    const { editor } = open()
    const diagram = newDiagram(editor)
    const [request, answer] = parts(diagram, 'message')
    editor.graph.setSelectionCell(answer!)
    editor.addSequenceMessage()
    type(editor, 'Три', 'Tab')
    editor.graph.stopEditing(false)
    editor.graph.setSelectionCells([request!, answer!])
    editor.addSequenceFrame('loop')
    editor.graph.stopEditing(false)
    const rows = () => diagram.getChildren().filter((child) => partOf(child) !== 'participant')
    const third = rows().at(-1)!
    expect(rows().map((child) => partOf(child))).toEqual(['frame', 'message', 'message', 'end', 'message'])

    // Above the first row of the frame, in the upper half of the frame: inside it, before that row.
    const requestState = editor.graph.getView().getState(request!)!
    const handler = editor.graph.getPlugin<SelectionHandler>('SelectionHandler')!
    handler.cell = third
    handler.moveCells([third], 1, 1, false, null, new MouseEvent('mouseup', { clientX: requestState.x + 5, clientY: requestState.y - 2 }))
    expect(rows().map((child) => String(child.getValue() ?? '') || partOf(child))).toEqual(['frame', 'Три', 'Запрос', 'Ответ', 'end'])
  })

  it('keeps parts out of what changes shapes on their own, and copies the whole diagram', () => {
    const { editor } = open()
    const diagram = newDiagram(editor)
    const [client] = parts(diagram, 'participant')
    editor.graph.setSelectionCell(client!)
    const state = editor.getState()
    expect(state.quickConnect).toBeNull()
    expect(state.geometry).toBeNull()
    expect(state.link).toBeNull()
    expect(state.properties).toBeNull()
    expect(state.canGroup).toBe(false)
    expect(state.sequence?.part).toEqual({ type: 'participant', cellId: client!.getId(), kind: 'participant' })

    editor.duplicate()
    const diagrams = editor.graph.getDefaultParent().getChildren().filter((cell) => cell.getStyle().shape === SEQUENCE_SHAPE)
    expect(diagrams).toHaveLength(2)
    expect(values(diagrams[1]!, 'participant')).toEqual(['Клиент', 'Сервис'])

    editor.graph.setSelectionCell(diagram)
    expect(editor.getState().geometry).toMatchObject({ canSetWidth: false, canSetHeight: false })
    expect(editor.getState().quickConnect).toBeNull()
  })

  it('adds and changes nothing for a participant who may only view, and nothing in a locked diagram', () => {
    const { doc, editor } = open()
    const diagram = newDiagram(editor)
    const viewer = open({ doc, readOnly: true })
    const theirs = viewer.editor.graph.getDataModel().getCell(diagram.getId()!)!
    viewer.editor.graph.setSelectionCell(theirs)
    expect(viewer.editor.addSequenceMessage()).toBeNull()
    expect(viewer.editor.getState().sequence?.canChange).toBe(false)
    expect(viewer.editor.sequenceMermaid(diagram.getId()!)).toContain('sequenceDiagram')

    editor.graph.setSelectionCell(diagram)
    editor.setLocked(true)
    expect(editor.addSequenceMessage()).toBeNull()
    expect(values(diagram, 'message')).toHaveLength(2)
    expect(editor.getState().sequence?.canChange).toBe(false)
  })

  it('keeps the messages that two participants add under one message at once, in the same order for both', () => {
    const alice = open()
    const bob = open({ doc: new Y.Doc() })
    const sync = connect(alice.doc, bob.doc)
    const diagram = newDiagram(alice.editor)
    alice.editor.graph.stopEditing(false)
    const request = parts(diagram, 'message')[0]!
    const theirs = bob.editor.graph.getDataModel().getCell(request.getId()!)!

    sync.disconnect()
    alice.editor.graph.setSelectionCell(request)
    alice.editor.addSequenceMessage()
    type(alice.editor, 'Алиса', 'Tab')
    alice.editor.graph.stopEditing(false)
    bob.editor.graph.setSelectionCell(theirs)
    bob.editor.addSequenceMessage()
    type(bob.editor, 'Боб', 'Tab')
    bob.editor.graph.stopEditing(false)
    sync.reconnect()

    const order = values(diagram, 'message')
    expect(order).toHaveLength(4)
    expect(order.slice(1, 3).sort()).toEqual(['Алиса', 'Боб'])
    expect(values(bob.editor.graph.getDataModel().getCell(diagram.getId()!)!, 'message')).toEqual(order)
    // Laid out one under another at both.
    for (const editor of [alice.editor, bob.editor]) {
      const own = editor.graph.getDataModel().getCell(diagram.getId()!)!
      const rows = ys(own, 'message')
      expect([...rows].sort((a, b) => a - b)).toEqual(rows)
      expect(new Set(rows).size).toBe(4)
    }
    // Each undoes only their own.
    alice.editor.undo()
    expect(values(diagram, 'message')).not.toContain('Алиса')
    expect(values(diagram, 'message')).toContain('Боб')
  })

  it('stores the parts in the cells of the page, the layout as their geometry', () => {
    const { doc, editor } = open()
    const diagram = newDiagram(editor)
    const stored = Array.from(getCells(doc).entries(), ([id, cell]) => readCell(id, cell)).filter((cell) => cell.parent === diagram.getId())
    expect(stored).toHaveLength(4)
    const message = stored.find((cell) => cell.value === 'Запрос')!
    expect(message.style).toEqual({ codrawSeq: 'message', [FROM_KEY]: expect.any(String), [TO_KEY]: expect.any(String) })
    expect(message.geometry!.width).toBeGreaterThan(0)
  })

  it('shows a diagram on the minimap by its frame, without its parts', () => {
    const { editor } = open()
    const diagram = newDiagram(editor)
    const sketch = editor.pageSketch()
    expect(sketch.shapes.map((shape) => shape.id)).toEqual([diagram.getId()])
    expect(sketch.shapes[0]).toMatchObject({ fill: null, stroke: '#6e7781' })
  })
})
