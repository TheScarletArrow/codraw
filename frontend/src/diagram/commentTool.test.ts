import type { Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor, type Point } from './editor.ts'
import { initializeDocument } from './model.ts'

describe('comment tool', () => {
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
    const editor = createDiagramEditor(container, doc, { readOnly, participantName: 'Алиса' })
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

  /** Presses the main button over `target`, moves through `path` and releases it, as a browser reports a click or a drag. */
  function drag(target: Element, path: Point[]) {
    const [start, ...rest] = path
    target.dispatchEvent(pointer('pointerdown', start!))
    for (const point of rest) target.dispatchEvent(pointer('pointermove', point))
    target.dispatchEvent(pointer('pointerup', rest.at(-1) ?? start!))
  }

  /** The points of the clicks with the comment tool that the editor reports, in order. */
  function record(editor: DiagramEditor) {
    const reported: Point[] = []
    editor.onCommentPoint((point) => reported.push(point))
    return reported
  }

  const key = (target: EventTarget, key: string, keyCode: number) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }))

  it('reports the point of a click over a shape, and selects and moves nothing', () => {
    const { editor, shape, geometry } = open()
    const before = geometry()
    const reported = record(editor)

    editor.setCommentTool(true)
    drag(nodeOf(editor, shape), [
      { x: 200, y: 200 },
      { x: 240, y: 230 },
    ])

    expect(reported).toEqual([{ x: 240, y: 230 }])
    expect(editor.graph.getSelectionCount()).toBe(0)
    expect(geometry()).toEqual(before)
  })

  it('reports clicks on the empty canvas and on a locked shape, and nothing while it is off', () => {
    const { editor, container, shape } = open()
    editor.graph.setSelectionCell(shape)
    editor.setLocked(true)
    editor.graph.clearSelection()
    const reported = record(editor)

    drag(container, [{ x: 20, y: 30 }])
    editor.setCommentTool(true)
    drag(container, [{ x: 20, y: 30 }])
    drag(nodeOf(editor, shape), [{ x: 210, y: 190 }])

    expect(reported).toEqual([
      { x: 20, y: 30 },
      { x: 210, y: 190 },
    ])
    expect(editor.graph.getSelectionCount()).toBe(0)
  })

  it('places nothing when the button is released beyond the canvas', () => {
    const { editor, container } = open()
    const reported = record(editor)
    editor.setCommentTool(true)

    container.dispatchEvent(pointer('pointerdown', { x: 20, y: 20 }))
    document.body.dispatchEvent(pointer('pointerup', { x: 900, y: 40 }))
    expect(reported).toEqual([])

    drag(container, [{ x: 30, y: 30 }])
    expect(reported).toEqual([{ x: 30, y: 30 }])
  })

  it('opens no label editor on a double click and lets the presses of the right button through', () => {
    const { editor, container, shape } = open()
    const reached: number[] = []
    container.addEventListener('pointerdown', (event) => reached.push(event.button))
    editor.setCommentTool(true)

    nodeOf(editor, shape).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 200, clientY: 200 }))
    container.dispatchEvent(pointer('pointerdown', { x: 20, y: 20 }, 2))
    container.dispatchEvent(pointer('pointerdown', { x: 20, y: 20 }, 0))

    expect(editor.getEditing()).toBeNull()
    expect(reached).toEqual([2])
  })

  it('turns on and off with C and off with Escape, also for a participant who may only view', () => {
    const { editor, container, shape } = open({ readOnly: true })
    container.focus()

    key(container, 'c', 67)
    expect(editor.getState().commentTool).toBe(true)
    expect(container).toHaveClass('comment-tool')
    key(container, 'c', 67)
    expect(editor.getState().commentTool).toBe(false)

    editor.setCommentTool(true)
    // The keyboard may be with the button of the toolbar.
    key(document.body.appendChild(document.createElement('button')), 'Escape', 27)
    expect(editor.getState().commentTool).toBe(false)
    expect(container).not.toHaveClass('comment-tool')
    drag(nodeOf(editor, shape), [{ x: 200, y: 200 }])
    expect(editor.graph.getSelectionCells()).toEqual([shape])
  })

  it('takes turns with the laser pointer, ending its stroke, and offers no quick connect meanwhile', () => {
    const { editor, container, shape } = open()
    const strokes: (Point | null)[] = []
    editor.onLaser((point) => strokes.push(point))
    const reported = record(editor)
    editor.graph.setSelectionCell(shape)

    editor.setLaser(true)
    container.dispatchEvent(pointer('pointerdown', { x: 20, y: 20 }))
    editor.setCommentTool(true)
    expect(editor.getState()).toMatchObject({ laser: false, commentTool: true, quickConnect: null })
    expect(container).not.toHaveClass('laser-pointer')
    expect(strokes).toEqual([{ x: 20, y: 20 }, null])

    drag(container, [{ x: 50, y: 60 }])
    expect(reported).toEqual([{ x: 50, y: 60 }])
    expect(strokes).toHaveLength(2)

    container.focus()
    key(container, 'k', 75)
    expect(editor.getState()).toMatchObject({ laser: true, commentTool: false })
    editor.setCommentTool(false)
    expect(editor.getState().laser).toBe(true)
    editor.setLaser(false)
    expect(editor.getState().quickConnect).not.toBeNull()
  })
})
