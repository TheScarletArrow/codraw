import type { Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor, type Point } from './editor.ts'
import { DEFAULT_PENCIL_LINE, pencilLine } from './freehand.ts'
import { initializeDocument } from './model.ts'
import { connect } from './testing.ts'

describe('eraser', () => {
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
    return { editor, container, doc, shape }
  }

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

  /** A wavy line from (x, y) to the right. */
  const wave = (x: number, y: number, length = 200): Point[] =>
    Array.from({ length: length / 4 + 1 }, (_, index) => ({ x: x + index * 4, y: y + Math.round(15 * Math.sin(index / 4)) }))

  /** Draws a line with the pencil through `path`, then turns the pencil off; returns the line. */
  function draw(editor: DiagramEditor, container: HTMLElement, path: Point[]): Cell {
    const before = new Set(lines(editor))
    editor.setPencil(true)
    drag(container, path)
    editor.setPencil(false)
    return lines(editor).find((line) => !before.has(line))!
  }

  /** The edges of the page, in all its layers and groups. */
  const lines = (editor: DiagramEditor) =>
    editor.graph
      .getDataModel()
      .getRoot()!
      .filterDescendants((cell) => cell.isEdge())

  const opacityOf = (editor: DiagramEditor, line: Cell) => (editor.graph.getView().getState(line)!.shape!.node as SVGElement).style.opacity

  const key = (target: EventTarget, key: string, keyCode: number) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }))

  it('erases the lines that a drag goes across as one undo step, which the other participant sees', () => {
    const alice = open()
    const bob = open({ doc: new Y.Doc() })
    connect(alice.doc, bob.doc)
    draw(alice.editor, alice.container, wave(20, 400))
    draw(alice.editor, alice.container, wave(20, 500))
    const kept = draw(alice.editor, alice.container, wave(400, 600))
    expect(lines(bob.editor)).toHaveLength(3)

    alice.editor.setEraser(true)
    expect(alice.container).toHaveClass('eraser-tool')
    drag(alice.container, [
      { x: 100, y: 350 },
      { x: 110, y: 450 },
      { x: 120, y: 560 },
    ])

    expect(lines(alice.editor)).toEqual([kept])
    expect(lines(bob.editor).map((line) => line.getId())).toEqual([kept.getId()])
    expect(alice.editor.getState().eraser).toBe(true)

    alice.editor.undo()

    expect(lines(alice.editor)).toHaveLength(3)
    expect(lines(bob.editor)).toHaveLength(3)
  })

  it('fades the lines it touches until the release, and leaves them when Escape turns it off', () => {
    const { editor, container } = open()
    const line = draw(editor, container, wave(20, 400))
    editor.setEraser(true)

    container.dispatchEvent(pointer('pointerdown', { x: 100, y: 350 }))
    container.dispatchEvent(pointer('pointermove', { x: 100, y: 450 }))

    expect(lines(editor)).toEqual([line])
    expect(opacityOf(editor, line)).toBe('0.3')

    key(document.body, 'Escape', 27)
    document.body.dispatchEvent(pointer('pointerup', { x: 100, y: 450 }))

    expect(editor.getState().eraser).toBe(false)
    expect(container).not.toHaveClass('eraser-tool')
    expect(lines(editor)).toEqual([line])
    expect(opacityOf(editor, line)).toBe('')
  })

  it('erases the line under a click, and nothing with a click on the empty canvas', () => {
    const { editor, container } = open()
    const line = draw(editor, container, [
      { x: 20, y: 400 },
      { x: 320, y: 400 },
    ])
    editor.setEraser(true)

    drag(container, [{ x: 160, y: 430 }])
    expect(lines(editor)).toEqual([line])

    drag(container, [{ x: 160, y: 405 }])
    expect(lines(editor)).toEqual([])
  })

  it('erases a thick line at its edge, within the radius of the eraser', () => {
    const { editor, container } = open()
    editor.setPencilLine({ width: 20 })
    const line = draw(editor, container, [
      { x: 20, y: 400 },
      { x: 320, y: 400 },
    ])
    editor.setEraser(true)

    // Half the width, 10, and the radius, 8.
    drag(container, [{ x: 160, y: 419 }])
    expect(lines(editor)).toEqual([line])
    drag(container, [{ x: 160, y: 417 }])
    expect(lines(editor)).toEqual([])
  })

  it('erases nothing but lines drawn by hand, and selects and moves nothing', () => {
    const { editor, container, shape } = open()
    const other = editor.addShape('rectangle', { x: 500, y: 200 })!
    const edge = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: '', source: shape, target: other })
    const line = draw(editor, container, wave(150, 200, 400))
    const { x, y } = shape.getGeometry()!
    editor.graph.setSelectionCell(shape)

    editor.setEraser(true)
    drag(container, [
      { x: 160, y: 150 },
      { x: 160, y: 250 },
      { x: 350, y: 250 },
      { x: 350, y: 150 },
    ])

    expect(lines(editor)).toEqual([edge])
    expect(line.getParent()).toBeNull()
    expect(shape.getGeometry()).toMatchObject({ x, y })
    expect(editor.graph.getSelectionCells()).toEqual([shape])
  })

  it('leaves a locked line and the lines of a locked layer, which do not fade', () => {
    const { editor, container } = open()
    const locked = draw(editor, container, wave(20, 400))
    editor.graph.setSelectionCell(locked)
    editor.setLocked(true)
    editor.graph.clearSelection()
    const layer = editor.addLayer()!
    const inLayer = draw(editor, container, wave(20, 500))
    editor.setLayerLocked(layer, true)
    editor.setEraser(true)

    container.dispatchEvent(pointer('pointerdown', { x: 100, y: 350 }))
    container.dispatchEvent(pointer('pointermove', { x: 100, y: 550 }))
    expect(opacityOf(editor, locked)).toBe('')
    expect(opacityOf(editor, inLayer)).toBe('')
    container.dispatchEvent(pointer('pointerup', { x: 100, y: 550 }))

    expect(lines(editor)).toEqual([locked, inLayer])
  })

  it('erases a line in a group where the canvas shows it', () => {
    const { editor, container, shape } = open()
    const other = editor.addShape('rectangle', { x: 500, y: 200 })!
    const line = draw(editor, container, wave(20, 400))
    editor.graph.setSelectionCells([shape, other, line])
    editor.group()
    expect(line.getParent()).not.toBe(editor.graph.getDefaultParent())
    editor.graph.clearSelection()
    editor.setEraser(true)

    drag(container, [
      { x: 100, y: 350 },
      { x: 100, y: 450 },
    ])

    expect(lines(editor)).toEqual([])
  })

  it('erases with the pointer that started only, and nothing when the browser takes the pointer', () => {
    const { editor, container } = open()
    const line = draw(editor, container, wave(20, 400))
    editor.setEraser(true)

    container.dispatchEvent(pointer('pointerdown', { x: 600, y: 20 }, { pointerType: 'touch' }))
    container.dispatchEvent(pointer('pointerdown', { x: 100, y: 350 }, { pointerType: 'touch', pointerId: 2 }))
    container.dispatchEvent(pointer('pointermove', { x: 100, y: 450 }, { pointerType: 'touch', pointerId: 2 }))
    container.dispatchEvent(pointer('pointerup', { x: 100, y: 450 }, { pointerType: 'touch', pointerId: 2 }))
    container.dispatchEvent(pointer('pointermove', { x: 700, y: 20 }, { pointerType: 'touch' }))
    container.dispatchEvent(pointer('pointerup', { x: 700, y: 20 }, { pointerType: 'touch' }))
    expect(lines(editor)).toEqual([line])

    container.dispatchEvent(pointer('pointerdown', { x: 100, y: 350 }, { pointerType: 'pen' }))
    container.dispatchEvent(pointer('pointermove', { x: 100, y: 450 }, { pointerType: 'pen' }))
    document.body.dispatchEvent(pointer('pointercancel', { x: 100, y: 450 }, { pointerType: 'pen' }))
    document.body.dispatchEvent(pointer('pointerup', { x: 100, y: 450 }, { pointerType: 'pen' }))
    expect(lines(editor)).toEqual([line])
    expect(opacityOf(editor, line)).toBe('')
  })

  it('erases a line that another participant drew while the button was held', () => {
    const alice = open()
    const bob = open({ doc: new Y.Doc() })
    connect(alice.doc, bob.doc)
    alice.editor.setEraser(true)
    // Both canvases are on one page here: the pointer of Alice is not that of Bob.
    const pen = { pointerId: 2, pointerType: 'pen' }

    alice.container.dispatchEvent(pointer('pointerdown', { x: 100, y: 300 }, pen))
    alice.container.dispatchEvent(pointer('pointermove', { x: 100, y: 320 }, pen))
    draw(bob.editor, bob.container, wave(20, 400))
    alice.container.dispatchEvent(pointer('pointermove', { x: 100, y: 450 }, pen))
    alice.container.dispatchEvent(pointer('pointerup', { x: 100, y: 450 }, pen))

    expect(lines(bob.editor)).toEqual([])
  })

  it('turns on and off with E, also on a draft, and takes turns with the other tools', () => {
    const { editor, container } = open({ collaboration: false })
    container.focus()

    key(container, 'e', 69)
    expect(editor.getState().eraser).toBe(true)
    // The same key of the Russian layout.
    key(container, 'у', 69)
    expect(editor.getState().eraser).toBe(false)

    editor.setPencil(true)
    editor.setEraser(true)
    expect(editor.getState()).toMatchObject({ eraser: true, pencil: false })
    editor.setLaser(true)
    expect(editor.getState()).toMatchObject({ eraser: false, laser: true })
    editor.setEraser(true)
    editor.setCommentTool(true)
    expect(editor.getState()).toMatchObject({ eraser: false, commentTool: true })
  })

  it('is not there for a participant who may only view', () => {
    const doc = board()
    const { editor: author, container: canvas } = open({ doc })
    draw(author, canvas, wave(20, 400))
    const { editor, container } = open({ doc, readOnly: true })
    container.focus()

    key(container, 'e', 69)
    editor.setEraser(true)
    drag(container, [
      { x: 100, y: 350 },
      { x: 100, y: 450 },
    ])

    expect(editor.getState().eraser).toBe(false)
    expect(lines(editor)).toHaveLength(1)
  })

  it('stays on when Escape closed a window of the toolbar', () => {
    const { editor } = open()
    editor.setEraser(true)
    // A popover of Radix closes on Escape in the capture phase and cancels the key.
    const closeWindow = (event: KeyboardEvent) => event.preventDefault()
    document.addEventListener('keydown', closeWindow, true)

    key(document.body, 'Escape', 27)
    document.removeEventListener('keydown', closeWindow, true)

    expect(editor.getState().eraser).toBe(true)
  })
})
