import type { Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor, type Point } from './editor.ts'
import { initializeDocument } from './model.ts'

describe('laser pointer', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    document.body.replaceChildren()
  })

  /** An editor of a page with a rectangle centred at (200, 200); the canvas is at the top-left corner of the window. */
  function open({ readOnly = false } = {}) {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const owner = createDiagramEditor(document.createElement('div'), doc)
    owner.addShape('rectangle', { x: 200, y: 200 })
    owner.destroy()
    const container = document.createElement('div')
    container.tabIndex = 0
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly })
    editors.push(editor)
    const shape = editor.graph.getDefaultParent().getChildAt(0)
    return { editor, container, shape, geometry: () => ({ x: shape.getGeometry()!.x, y: shape.getGeometry()!.y }) }
  }

  /** The element that the browser would dispatch pointer events over the shape at. */
  const nodeOf = (editor: DiagramEditor, cell: Cell) => editor.graph.getView().getState(cell)!.shape!.node as Element

  const pointer = (type: string, { x, y }: Point, button = 0, buttons = type === 'pointerup' ? 0 : 1 << button) =>
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button,
      buttons,
      pointerId: 1,
      isPrimary: true,
      pointerType: 'mouse',
    })

  /** Presses the main button over `target`, moves through `path` and releases it, as a browser reports a drag. */
  function drag(target: Element, path: Point[]) {
    const [start, ...rest] = path
    target.dispatchEvent(pointer('pointerdown', start!))
    for (const point of rest) target.dispatchEvent(pointer('pointermove', point))
    target.dispatchEvent(pointer('pointerup', rest.at(-1) ?? start!))
  }

  /** Everything the editor reports about drags with the laser pointer, in order. */
  function record(editor: DiagramEditor) {
    const reported: (Point | null)[] = []
    editor.onLaser((point) => reported.push(point))
    return reported
  }

  const key = (target: EventTarget, key: string, keyCode: number) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }))

  it('selects with a press of the main button while it is off', () => {
    const { editor, shape } = open()

    drag(nodeOf(editor, shape), [{ x: 200, y: 200 }])

    expect(editor.graph.getSelectionCells()).toEqual([shape])
  })

  it('reports the points of a drag and its end, and selects and moves nothing', () => {
    const { editor, shape, geometry } = open()
    const before = geometry()
    const reported = record(editor)

    editor.setLaser(true)
    drag(nodeOf(editor, shape), [
      { x: 200, y: 200 },
      { x: 260, y: 230 },
      { x: 320, y: 260 },
    ])

    expect(reported).toEqual([{ x: 200, y: 200 }, { x: 260, y: 230 }, { x: 320, y: 260 }, null])
    expect(editor.graph.getSelectionCount()).toBe(0)
    expect(geometry()).toEqual(before)
  })

  it('draws on beyond the canvas until the button is released anywhere', () => {
    const { editor, container } = open()
    const reported = record(editor)
    editor.setLaser(true)

    container.dispatchEvent(pointer('pointerdown', { x: 20, y: 20 }))
    document.body.dispatchEvent(pointer('pointermove', { x: 900, y: 40 }))
    document.body.dispatchEvent(pointer('pointerup', { x: 900, y: 40 }))
    document.body.dispatchEvent(pointer('pointermove', { x: 950, y: 40 }))

    expect(reported).toEqual([{ x: 20, y: 20 }, { x: 900, y: 40 }, null])
  })

  it('selects nothing with the frame dragged over the empty canvas', () => {
    const { editor, container } = open()
    const frame = () =>
      drag(container, [
        { x: 10, y: 10 },
        { x: 150, y: 150 },
        { x: 400, y: 400 },
      ])
    frame()
    expect(editor.graph.getSelectionCount()).toBe(1)
    editor.graph.clearSelection()

    editor.setLaser(true)
    frame()

    expect(editor.graph.getSelectionCount()).toBe(0)
  })

  it('opens no label editor on a double click', () => {
    const { editor, shape } = open()
    const doubleClick = () =>
      nodeOf(editor, shape).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 200, clientY: 200 }))
    doubleClick()
    expect(editor.getEditing()).toEqual({ cellId: shape.getId(), changedRemotely: false })
    editor.graph.stopEditing(true)

    editor.setLaser(true)
    doubleClick()

    expect(editor.graph.isEditing()).toBe(false)
    expect(editor.getEditing()).toBeNull()
  })

  it('lets the presses of the right button through, which pan and open the menu', () => {
    const { editor, container } = open()
    const reported = record(editor)
    const reached: number[] = []
    container.addEventListener('pointerdown', (event) => reached.push(event.button))
    editor.setLaser(true)

    container.dispatchEvent(pointer('pointerdown', { x: 20, y: 20 }, 2))
    container.dispatchEvent(pointer('pointerdown', { x: 20, y: 20 }, 0))

    expect(reached).toEqual([2])
    expect(reported).toEqual([{ x: 20, y: 20 }])
  })

  it('turns on and off with K and off with Escape, also for a participant who may only view', () => {
    const { editor, container } = open({ readOnly: true })
    container.focus()

    key(container, 'k', 75)
    expect(editor.getState().laser).toBe(true)
    expect(container).toHaveClass('laser-pointer')
    key(container, 'k', 75)
    expect(editor.getState().laser).toBe(false)

    editor.setLaser(true)
    // The keyboard may be with the button of the toolbar.
    key(document.body.appendChild(document.createElement('button')), 'Escape', 27)
    expect(editor.getState().laser).toBe(false)
    expect(container).not.toHaveClass('laser-pointer')
  })

  it('ends the stroke when it is turned off and offers no quick connect meanwhile', () => {
    const { editor, container, shape } = open()
    const reported = record(editor)
    editor.graph.setSelectionCell(shape)
    expect(editor.getState().quickConnect).not.toBeNull()

    editor.setLaser(true)
    expect(editor.getState().quickConnect).toBeNull()
    container.dispatchEvent(pointer('pointerdown', { x: 20, y: 20 }))
    editor.setLaser(false)
    container.dispatchEvent(pointer('pointermove', { x: 40, y: 40 }))

    expect(reported).toEqual([{ x: 20, y: 20 }, null])
    expect(editor.getState().quickConnect).not.toBeNull()
  })
})
