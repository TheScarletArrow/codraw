import { EdgeHandler, Geometry, Rectangle, type Cell, type SelectionCellsHandler } from '@maxgraph/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor, type Point } from './editor.ts'
import { DEFAULT_PENCIL_LINE, pencilLine } from './freehand.ts'
import { getCells, initializeDocument } from './model.ts'
import { routingInput } from './routing/routingInput.ts'
import { connect } from './testing.ts'

describe('pencil', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    document.body.replaceChildren()
    pencilLine.set(DEFAULT_PENCIL_LINE)
  })

  /** A board with a rectangle centred at (200, 200). */
  function board() {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const owner = createDiagramEditor(document.createElement('div'), doc)
    owner.addShape('rectangle', { x: 200, y: 200 })
    owner.destroy()
    return doc
  }

  /** An editor of the board; the canvas is at the top-left corner of the window, so client points are diagram points. */
  function open({ doc = board(), readOnly = false, collaboration = true } = {}) {
    const container = document.createElement('div')
    container.tabIndex = 0
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly, collaboration, participantName: 'Алиса', participantId: 'alice' })
    editors.push(editor)
    const shape = editor.graph.getDefaultParent().getChildren().find((cell) => cell.isVertex())!
    return { editor, container, doc, shape, geometry: () => ({ x: shape.getGeometry()!.x, y: shape.getGeometry()!.y }) }
  }

  /** The element that the browser would dispatch pointer events over the shape at. */
  const nodeOf = (editor: DiagramEditor, cell: Cell) => editor.graph.getView().getState(cell)!.shape!.node as Element

  interface PointerOptions {
    button?: number
    pointerId?: number
    pointerType?: string
  }

  const pointer = (type: string, { x, y }: Point, { button = 0, pointerId = 1, pointerType = 'mouse' }: PointerOptions = {}) =>
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button,
      buttons: type === 'pointerup' ? 0 : 1 << button,
      pointerId,
      isPrimary: pointerId === 1,
      pointerType,
    })

  /** Presses the main button over `target`, moves through `path` and releases it, as a browser reports a drag. */
  function drag(target: Element, path: Point[], options: PointerOptions = {}) {
    const [start, ...rest] = path
    target.dispatchEvent(pointer('pointerdown', start!, options))
    for (const point of rest) target.dispatchEvent(pointer('pointermove', point, options))
    target.dispatchEvent(pointer('pointerup', rest.at(-1) ?? start!, options))
  }

  /** A wavy stroke from (x, y) to the right. */
  const wave = (x: number, y: number, length = 200): Point[] =>
    Array.from({ length: length / 4 + 1 }, (_, index) => ({ x: x + index * 4, y: y + Math.round(15 * Math.sin(index / 4)) }))

  const lines = (editor: DiagramEditor) =>
    editor.graph
      .getDefaultParent()
      .getChildren()
      .filter((cell) => cell.isEdge())

  /** The points of a line from its start through its bends to its end. */
  const pathOf = (line: Cell) => {
    const geometry = line.getGeometry()!
    return [geometry.sourcePoint!, ...(geometry.points ?? []), geometry.targetPoint!].map(({ x, y }) => ({ x, y }))
  }

  const key = (target: EventTarget, key: string, keyCode: number) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }))

  it('draws a line by hand over a shape, and selects and moves nothing', () => {
    const { editor, shape, geometry } = open()
    const before = geometry()

    editor.setPencil(true)
    drag(nodeOf(editor, shape), wave(200, 200))

    const [line, ...others] = lines(editor)
    expect(others).toEqual([])
    expect(line!.getStyle()).toEqual({
      codrawFreehand: true,
      edgeStyle: 'none',
      curved: true,
      endArrow: 'none',
      strokeColor: '#1f2328',
      strokeWidth: 2,
    })
    expect(line!.getTerminal(true)).toBeNull()
    expect(line!.getTerminal(false)).toBeNull()
    const path = pathOf(line!)
    expect(path[0]).toEqual({ x: 200, y: 200 })
    expect(path.at(-1)).toEqual(wave(200, 200).at(-1))
    expect(path.length).toBeGreaterThan(5)
    expect(path.length).toBeLessThan(wave(200, 200).length)
    expect(editor.graph.getSelectionCount()).toBe(0)
    expect(geometry()).toEqual(before)
  })

  it('stays on for the next line until Escape turns it off', () => {
    const { editor, container, shape } = open()
    editor.setPencil(true)
    expect(container).toHaveClass('pencil-tool')

    drag(container, wave(20, 400))
    drag(container, wave(20, 500))
    expect(lines(editor)).toHaveLength(2)
    expect(editor.getState().pencil).toBe(true)

    // The keyboard may be with the button of the toolbar.
    key(document.body.appendChild(document.createElement('button')), 'Escape', 27)
    expect(editor.getState().pencil).toBe(false)
    expect(container).not.toHaveClass('pencil-tool')
    drag(nodeOf(editor, shape), [{ x: 200, y: 200 }])
    expect(editor.graph.getSelectionCells()).toEqual([shape])
  })

  it('adds the line as one undo step, which the other participant sees', () => {
    const alice = open()
    const bob = open({ doc: new Y.Doc() })
    connect(alice.doc, bob.doc)
    alice.editor.setPencil(true)

    drag(alice.container, wave(20, 400))

    const [line] = lines(alice.editor)
    const [seen, ...more] = lines(bob.editor)
    expect(more).toEqual([])
    expect(seen!.getId()).toBe(line!.getId())
    expect(pathOf(seen!)).toEqual(pathOf(line!))
    expect(seen!.getStyle()).toMatchObject({ codrawFreehand: true, curved: true })
    expect(getCells(alice.doc).get(line!.getId()!)!.get('modifiedByName')).toBe('Алиса')

    alice.editor.undo()

    expect(lines(alice.editor)).toEqual([])
    expect(lines(bob.editor)).toEqual([])
  })

  it('keeps the ends of a straight line only, and draws nothing for a click', () => {
    const { editor, container } = open()
    editor.setPencil(true)

    drag(
      container,
      Array.from({ length: 100 }, (_, index) => ({ x: 20 + index * 3, y: 400 + index })),
    )
    drag(container, [{ x: 50, y: 50 }])
    drag(container, [
      { x: 60, y: 60 },
      { x: 61, y: 61 },
    ])

    expect(lines(editor).map(pathOf)).toEqual([
      [
        { x: 20, y: 400 },
        { x: 317, y: 499 },
      ],
    ])
  })

  it('draws with the pointer that started the line only, and drops a line that the browser cancels', () => {
    const { editor, container } = open()
    editor.setPencil(true)

    container.dispatchEvent(pointer('pointerdown', { x: 20, y: 20 }, { pointerType: 'touch' }))
    container.dispatchEvent(pointer('pointerdown', { x: 300, y: 300 }, { pointerType: 'touch', pointerId: 2 }))
    container.dispatchEvent(pointer('pointermove', { x: 320, y: 300 }, { pointerType: 'touch', pointerId: 2 }))
    container.dispatchEvent(pointer('pointerup', { x: 320, y: 300 }, { pointerType: 'touch', pointerId: 2 }))
    container.dispatchEvent(pointer('pointermove', { x: 120, y: 20 }, { pointerType: 'touch' }))
    container.dispatchEvent(pointer('pointerup', { x: 120, y: 20 }, { pointerType: 'touch' }))
    expect(lines(editor).map(pathOf)).toEqual([
      [
        { x: 20, y: 20 },
        { x: 120, y: 20 },
      ],
    ])

    container.dispatchEvent(pointer('pointerdown', { x: 20, y: 100 }, { pointerType: 'pen' }))
    container.dispatchEvent(pointer('pointermove', { x: 120, y: 100 }, { pointerType: 'pen' }))
    document.body.dispatchEvent(pointer('pointercancel', { x: 120, y: 100 }, { pointerType: 'pen' }))
    document.body.dispatchEvent(pointer('pointerup', { x: 120, y: 100 }, { pointerType: 'pen' }))
    expect(lines(editor)).toHaveLength(1)
  })

  it('draws on beyond the canvas until the button is released anywhere', () => {
    const { editor, container } = open()
    editor.setPencil(true)

    container.dispatchEvent(pointer('pointerdown', { x: 20, y: 20 }))
    document.body.dispatchEvent(pointer('pointermove', { x: 900, y: 40 }))
    document.body.dispatchEvent(pointer('pointerup', { x: 900, y: 40 }))
    document.body.dispatchEvent(pointer('pointermove', { x: 950, y: 400 }))

    expect(lines(editor).map(pathOf)).toEqual([
      [
        { x: 20, y: 20 },
        { x: 900, y: 40 },
      ],
    ])
  })

  it('shows the trace of the line while it is drawn, and drops the line when another tool is turned on', () => {
    const { editor, container } = open()
    const overlay = editor.graph.getView().getOverlayPane()
    editor.setPencil(true)

    container.dispatchEvent(pointer('pointerdown', { x: 20, y: 20 }))
    container.dispatchEvent(pointer('pointermove', { x: 60, y: 30 }))
    container.dispatchEvent(pointer('pointermove', { x: 100, y: 20 }))

    const trace = overlay.querySelector('path')
    expect(trace).not.toBeNull()
    expect(trace!.getAttribute('stroke')).toBe('#1f2328')
    expect(trace!.getAttribute('d')).toContain('Q')

    editor.setLaser(true)
    container.dispatchEvent(pointer('pointerup', { x: 100, y: 20 }))

    expect(editor.getState()).toMatchObject({ laser: true, pencil: false })
    expect(overlay.querySelector('path')).toBeNull()
    expect(lines(editor)).toEqual([])
  })

  it('turns on and off with P, also on a draft, and takes turns with the laser pointer and the comment tool', () => {
    const { editor, container } = open({ collaboration: false })
    container.focus()

    key(container, 'p', 80)
    expect(editor.getState().pencil).toBe(true)
    // The same key of the Russian layout.
    key(container, 'з', 80)
    expect(editor.getState().pencil).toBe(false)

    editor.setLaser(true)
    editor.setPencil(true)
    expect(editor.getState()).toMatchObject({ pencil: true, laser: false })
    editor.setCommentTool(true)
    expect(editor.getState()).toMatchObject({ pencil: false, commentTool: true })
  })

  it('is not there for a participant who may only view', () => {
    const { editor, container } = open({ readOnly: true })
    container.focus()

    key(container, 'p', 80)
    editor.setPencil(true)
    drag(container, wave(20, 400))

    expect(editor.getState().pencil).toBe(false)
    expect(lines(editor)).toEqual([])
  })

  it('stays on when Escape closed a window of the toolbar', () => {
    const { editor } = open()
    editor.setPencil(true)
    // A popover of Radix closes on Escape in the capture phase and cancels the key.
    const closeWindow = (event: KeyboardEvent) => event.preventDefault()
    document.addEventListener('keydown', closeWindow, true)

    key(document.body, 'Escape', 27)
    document.removeEventListener('keydown', closeWindow, true)

    expect(editor.getState().pencil).toBe(true)
  })

  it('draws with the color, the width and the dash last chosen for lines', () => {
    const { editor, container, shape } = open()
    expect(editor.getState().pencilLine).toEqual({ color: '#1f2328', width: 2, dash: 'solid' })

    editor.graph.setSelectionCell(shape)
    editor.setColor('stroke', '#b85450')
    editor.setColor('stroke', 'none')
    editor.setLineStyle({ width: 4, dash: 'dotted' })
    editor.graph.clearSelection()
    editor.setPencil(true)
    drag(container, wave(20, 400))

    expect(editor.getState().pencilLine).toEqual({ color: '#b85450', width: 4, dash: 'dotted' })
    expect(lines(editor)[0]!.getStyle()).toMatchObject({ strokeColor: '#b85450', strokeWidth: 4, dashed: true, dashPattern: '1 2' })

    editor.setPencilLine({ width: 50, dash: 'solid' })
    expect(editor.getState().pencilLine).toMatchObject({ width: 20, dash: 'solid' })
    editor.setPencilLine({ color: '#6c8ebf', width: 1 })
    drag(container, wave(20, 500))
    const style = lines(editor)[1]!.getStyle()
    expect(style).toMatchObject({ strokeColor: '#6c8ebf' })
    expect(style).not.toHaveProperty('strokeWidth')
    expect(style).not.toHaveProperty('dashed')
  })

  it('keeps the line of the pencil on other pages of the tab', () => {
    const first = open()
    first.editor.setPencilLine({ color: '#b85450' })
    first.editor.destroy()

    const second = open()

    expect(second.editor.getState().pencilLine.color).toBe('#b85450')
  })

  /** An editor with a line drawn by hand, the pencil off again. */
  function withLine() {
    const opened = open()
    opened.editor.setPencil(true)
    drag(opened.container, wave(20, 400))
    opened.editor.setPencil(false)
    return { ...opened, line: lines(opened.editor)[0]! }
  }

  it('shows a selected line by its outline, without handles, and moves it as a whole', () => {
    const { editor, line } = withLine()
    const before = pathOf(line)

    editor.graph.setSelectionCell(line)
    const handler = editor.graph.getPlugin<SelectionCellsHandler>('SelectionCellsHandler')!.getHandler(line)
    expect(handler).toBeInstanceOf(EdgeHandler)
    expect((handler as EdgeHandler).bends).toEqual([])
    editor.moveSelection(30, 10)

    expect(pathOf(line)).toEqual(before.map(({ x, y }) => ({ x: x + 30, y: y + 10 })))
    editor.undo()
    expect(pathOf(line)).toEqual(before)
  })

  it('copies, pastes and duplicates a line drawn by hand', () => {
    const { editor, line } = withLine()
    editor.graph.setSelectionCell(line)
    expect(editor.getState().canCopy).toBe(true)

    editor.duplicate()
    editor.graph.setSelectionCell(line)
    editor.copy()
    editor.paste()

    const [, duplicate, pasted] = lines(editor)
    const shifted = (by: number) => pathOf(line).map(({ x, y }) => ({ x: x + by, y: y + by }))
    expect(pathOf(duplicate!)).toEqual(shifted(20))
    expect(pathOf(pasted!)).toEqual(shifted(20))
    expect(pasted!.getStyle()).toMatchObject({ codrawFreehand: true, curved: true })
    expect(editor.graph.getSelectionCells()).toEqual([pasted])
  })

  it('copies a line into the clipboard of the system in the format of draw.io, which pastes it back', async () => {
    const { editor, container, line } = withLine()
    editor.graph.setSelectionCell(line)
    const data = new Map<string, string>()
    const copy = new Event('copy', { bubbles: true, cancelable: true })
    Object.defineProperty(copy, 'clipboardData', { value: { setData: (kind: string, value: string) => data.set(kind, value) } })
    container.dispatchEvent(copy)

    const xml = decodeURIComponent(data.get('text/plain')!)
    expect(xml).toContain('codrawFreehand=1;edgeStyle=none;curved=1;endArrow=none;')
    expect(xml).toContain('as="sourcePoint"')

    // Not the text the tab copied, so it is read as a fragment of draw.io.
    editor.paste(undefined, xml)
    await vi.waitFor(() => expect(lines(editor)).toHaveLength(2))
    expect(lines(editor)[1]!.getStyle()).toMatchObject({ codrawFreehand: true, curved: true })
    expect(pathOf(lines(editor)[1]!)).toHaveLength(pathOf(line).length)
  })

  it('cuts a selected line as one undo step, and exports it alone as the selection', () => {
    const { editor, line } = withLine()
    editor.graph.setSelectionCell(line)

    expect(editor.exportSvg({ selectionOnly: true })?.cellIds).toEqual([line.getId()])
    editor.cut()
    expect(lines(editor)).toEqual([])
    editor.undo()
    expect(lines(editor)).toHaveLength(1)
  })

  it('has no shape of an edge, which the shape of selected edges leaves as it is', () => {
    const { editor, line, shape } = withLine()
    const other = editor.addShape('rectangle', { x: 500, y: 200 })!
    const edge = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: shape, target: other })

    editor.graph.setSelectionCell(line)
    expect(editor.getState().line).toMatchObject({ edgeShape: null, hasEdges: false })
    editor.graph.setSelectionCells([line, edge])
    editor.setLineStyle({ edgeShape: 'straight' })

    expect(edge.getStyle()).toMatchObject({ edgeStyle: 'none' })
    expect(line.getStyle()).toMatchObject({ edgeStyle: 'none', curved: true })
    expect(editor.getState().line).toMatchObject({ edgeShape: 'straight', hasEdges: true })
  })

  it('is selected by a selection frame that crosses it, not by one inside the area it goes around', () => {
    const { editor, line } = withLine()
    // The wave goes from (20, 400) to the right, 15 up and down.
    editor.graph.selectRegion(new Rectangle(100, 380, 20, 40), new MouseEvent('mouseup'))
    expect(editor.graph.getSelectionCells()).toEqual([line])

    editor.graph.clearSelection()
    editor.graph.selectRegion(new Rectangle(100, 500, 20, 20), new MouseEvent('mouseup'))
    expect(editor.graph.getSelectionCells()).toEqual([])
  })

  it('goes into a group with the shapes selected with it, where it stays as drawn', () => {
    const { editor, line, shape } = withLine()
    const other = editor.addShape('rectangle', { x: 500, y: 200 })!
    const drawn = editor.graph.getView().getState(line)!.absolutePoints.map((point) => ({ x: point!.x, y: point!.y }))

    editor.graph.setSelectionCells([shape, other, line])
    const group = editor.group()!

    expect(line.getParent()).toBe(group)
    const grouped = editor.graph.getView().getState(line)!.absolutePoints.map((point) => ({ x: point!.x, y: point!.y }))
    expect(grouped).toEqual(drawn)
  })

  it('is left alone by the router of edges and by auto layout', async () => {
    const { editor, line, shape } = withLine()
    const other = editor.addShape('rectangle', { x: 600, y: 600 })!
    editor.graph.getDataModel().setGeometry(other, new Geometry(700, 100, 120, 60))
    editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: shape, target: other })
    const before = pathOf(line)

    expect(routingInput(editor.graph.getDefaultParent()).connectors.map((connector) => connector.id)).not.toContain(line.getId())
    editor.graph.clearSelection()
    await editor.autoLayout('down')

    expect(pathOf(line)).toEqual(before)
  })
})
