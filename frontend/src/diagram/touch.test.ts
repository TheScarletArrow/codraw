import type { Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type ContextMenuRequest, type DiagramEditor, type Point } from './editor.ts'
import { initializeDocument } from './model.ts'
import { DOUBLE_TAP_ZOOM, PAN_THRESHOLD } from './touch.ts'

describe('fingers on the canvas', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    document.body.replaceChildren()
    vi.useRealTimers()
  })

  /** An editor of a page with a rectangle centred at (200, 200); the canvas is at the top-left corner of the window. */
  function open() {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const owner = createDiagramEditor(document.createElement('div'), doc)
    owner.addShape('rectangle', { x: 200, y: 200 })
    owner.destroy()
    const container = document.createElement('div')
    container.tabIndex = 0
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { participantName: 'Алиса' })
    editors.push(editor)
    const shape = editor.graph.getDefaultParent().getChildAt(0)
    const menus: ContextMenuRequest[] = []
    editor.onContextMenu((request) => menus.push(request))
    return { editor, container, shape, menus, geometry: () => ({ x: shape.getGeometry()!.x, y: shape.getGeometry()!.y }) }
  }

  /** The element that the browser would dispatch pointer events over the shape at. */
  const nodeOf = (editor: DiagramEditor, cell: Cell) => editor.graph.getView().getState(cell)!.shape!.node as Element
  /** The element of the empty canvas, under the shapes. */
  const background = (editor: DiagramEditor) => editor.graph.getView().getBackgroundPane() as Element

  const pointer = (type: string, { x, y }: Point, { id = 1, pointerType = 'touch' } = {}) =>
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: type === 'pointermove' ? -1 : 0,
      buttons: type === 'pointerup' ? 0 : 1,
      pointerId: id,
      isPrimary: id === 1,
      pointerType,
    })

  /** Presses over `target`, moves through `path` and lifts, as a browser reports a drag of a finger or of the mouse. */
  function drag(target: Element, path: Point[], options?: { pointerType?: string }) {
    const [start, ...rest] = path
    target.dispatchEvent(pointer('pointerdown', start!, options))
    for (const point of rest) target.dispatchEvent(pointer('pointermove', point, options))
    target.dispatchEvent(pointer('pointerup', rest.at(-1) ?? start!, options))
  }

  /** The panning and the zoom of the fingers are applied once a frame. */
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

  it('pans the canvas with a finger on the empty canvas, beyond what it scrolls to, and draws no frame', async () => {
    const { editor, shape } = open()
    const before = editor.viewportCenter()

    drag(background(editor), [
      { x: 20, y: 20 },
      { x: 25, y: 22 },
      { x: 80, y: 100 },
      { x: 120, y: 160 },
    ])
    await nextFrame()

    const after = editor.viewportCenter()
    expect(after.x).toBeCloseTo(before.x - 100)
    expect(after.y).toBeCloseTo(before.y - 140)
    expect(editor.graph.isCellSelected(shape)).toBe(false)
    expect(editor.graph.getView().scale).toBe(1)
  })

  it('leaves a finger that moves less than the threshold to a tap, and the mouse to the frame of a selection', async () => {
    const { editor, shape } = open()
    const before = editor.viewportCenter()

    drag(background(editor), [
      { x: 20, y: 20 },
      { x: 20 + PAN_THRESHOLD - 1, y: 20 },
    ])
    await nextFrame()
    expect(editor.viewportCenter()).toEqual(before)

    // The mouse draws a frame around the shape and pans nothing.
    drag(
      background(editor),
      [
        { x: 100, y: 100 },
        { x: 200, y: 200 },
        { x: 300, y: 300 },
      ],
      { pointerType: 'mouse' },
    )
    await nextFrame()
    expect(editor.graph.isCellSelected(shape)).toBe(true)
    expect(editor.viewportCenter()).toEqual(before)
  })

  it('moves a shape under a finger, as the mouse does', () => {
    const { editor, shape, geometry } = open()
    const before = geometry()

    drag(nodeOf(editor, shape), [
      { x: 200, y: 200 },
      { x: 220, y: 210 },
      { x: 240, y: 230 },
    ])

    expect(geometry()).toEqual({ x: before.x + 40, y: before.y + 30 })
  })

  it('zooms with two fingers around the point between them, and the page gets none of the gesture', async () => {
    const { editor, container, geometry } = open()
    const before = geometry()
    const reached: string[] = []
    container.addEventListener('pointermove', (event) => reached.push(event.type))
    const target = background(editor)

    target.dispatchEvent(pointer('pointerdown', { x: 150, y: 100 }, { id: 1 }))
    target.dispatchEvent(pointer('pointerdown', { x: 250, y: 100 }, { id: 2 }))
    target.dispatchEvent(pointer('pointermove', { x: 100, y: 100 }, { id: 1 }))
    target.dispatchEvent(pointer('pointermove', { x: 300, y: 100 }, { id: 2 }))
    await nextFrame()

    expect(editor.graph.getView().scale).toBeCloseTo(2)
    expect(reached).toEqual([])
    target.dispatchEvent(pointer('pointerup', { x: 100, y: 100 }, { id: 1 }))
    target.dispatchEvent(pointer('pointerup', { x: 300, y: 100 }, { id: 2 }))
    // Nothing on the board moved, and the next touch is a tap of its own.
    expect(geometry()).toEqual(before)
    expect(editor.graph.isMouseDown).toBe(false)
  })

  it('opens the menu of a shape held under a finger, and selects it', () => {
    vi.useFakeTimers()
    const { editor, shape, menus } = open()

    nodeOf(editor, shape).dispatchEvent(pointer('pointerdown', { x: 200, y: 200 }))
    vi.advanceTimersByTime(600)

    expect(menus).toHaveLength(1)
    expect(menus[0]).toMatchObject({ target: 'shape', cellId: shape.getId(), x: 200, y: 200 })
    expect(editor.graph.isCellSelected(shape)).toBe(true)
  })

  it('opens the menu of the canvas held under a finger, and no menu for the mouse held still or a moving finger', () => {
    vi.useFakeTimers()
    const { editor, shape, menus } = open()
    editor.graph.setSelectionCell(shape)

    background(editor).dispatchEvent(pointer('pointerdown', { x: 20, y: 20 }))
    vi.advanceTimersByTime(600)
    background(editor).dispatchEvent(pointer('pointerup', { x: 20, y: 20 }))
    expect(menus.map((menu) => menu.target)).toEqual(['canvas'])
    expect(editor.graph.getSelectionCount()).toBe(0)

    nodeOf(editor, shape).dispatchEvent(pointer('pointerdown', { x: 200, y: 200 }, { pointerType: 'mouse' }))
    vi.advanceTimersByTime(600)
    nodeOf(editor, shape).dispatchEvent(pointer('pointerup', { x: 200, y: 200 }, { pointerType: 'mouse' }))

    background(editor).dispatchEvent(pointer('pointerdown', { x: 20, y: 20 }))
    background(editor).dispatchEvent(pointer('pointermove', { x: 60, y: 80 }))
    vi.advanceTimersByTime(600)
    background(editor).dispatchEvent(pointer('pointerup', { x: 60, y: 80 }))
    expect(menus).toHaveLength(1)
  })

  it('zooms in around the point of a double tap on the empty canvas, and not for a double click of the mouse', () => {
    const { editor } = open()
    const dblclick = (point: Point) =>
      background(editor).dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, detail: 2 }),
      )

    background(editor).dispatchEvent(pointer('pointerdown', { x: 40, y: 60 }, { pointerType: 'mouse' }))
    dblclick({ x: 40, y: 60 })
    expect(editor.graph.getView().scale).toBe(1)

    background(editor).dispatchEvent(pointer('pointerdown', { x: 40, y: 60 }))
    background(editor).dispatchEvent(pointer('pointerup', { x: 40, y: 60 }))
    dblclick({ x: 40, y: 60 })
    expect(editor.graph.getView().scale).toBeCloseTo(DOUBLE_TAP_ZOOM)
  })
})
