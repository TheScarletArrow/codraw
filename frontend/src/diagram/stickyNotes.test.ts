import type { Cell, CellEditorHandler } from '@maxgraph/core'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { readTextAuthor, TEXT_AUTHOR_KEY, type Author } from './attribution.ts'
import { STICKY_COLORS } from './colors.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { getCells, initializeDocument, readCell } from './model.ts'
import { STICKY_FONT_SIZE, TEXT_FIT_KEY } from './shapes.ts'
import { connect } from './testing.ts'

const ALICE: Author = { id: '0199a000-0000-7000-8000-00000000000a', name: 'Алиса' }
const BOB: Author = { id: '0199a000-0000-7000-8000-00000000000b', name: 'Боб' }

/** A text that size 20 does not fit into a sticky: 30 words of 5 letters fit at 12. */
const LONG_TEXT = Array.from({ length: 30 }, () => 'слово').join(' ')

describe('stickies', () => {
  // jsdom measures no text: every character is half the size of the font wide.
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText(this: { font: string }, text: string) {
        return { width: text.length * 0.5 * parseFloat(/([\d.]+)px/.exec(this.font)![1]!) }
      },
    } as unknown as CanvasRenderingContext2D)
  })

  const editors: DiagramEditor[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    document.body.replaceChildren()
  })

  /** An editor of a page; the canvas is at the top-left corner of the window, so client points are diagram points. */
  function open({ participant = ALICE, doc = new Y.Doc(), readOnly = false } = {}) {
    if (!readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    container.tabIndex = 0
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, {
      readOnly,
      participantName: participant.name,
      participantId: participant.id,
    })
    editors.push(editor)
    return { doc, editor, container }
  }

  /** Alice and Bob on one board. */
  function participants() {
    const alice = open({ participant: ALICE })
    const bob = open({ participant: BOB })
    connect(alice.doc, bob.doc)
    return { alice, bob }
  }

  const cellEditor = (editor: DiagramEditor) => editor.graph.getPlugin<CellEditorHandler>('CellEditorHandler')!
  /** Types into the label being edited and applies it. */
  const typeAndApply = (editor: DiagramEditor, text: string) => {
    cellEditor(editor).textarea!.textContent = text
    editor.graph.stopEditing(false)
  }
  const dataOf = (doc: Y.Doc, cell: Cell) => {
    const entry = getCells(doc).get(cell.getId()!)
    return entry && readCell(cell.getId()!, entry)
  }
  const stickiesOf = (editor: DiagramEditor) =>
    editor.graph
      .getDefaultParent()
      .getChildren()
      .filter((cell) => (cell.getStyle() as Record<string, unknown>).codrawShape === 'sticky')
  const theirs = (editor: DiagramEditor, cell: Cell) => editor.graph.getDataModel().getCell(cell.getId()!)!
  /** Presses a key on the canvas as the browser would. */
  const press = (container: HTMLElement, init: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    container.dispatchEvent(event)
    return event
  }
  const pressN = (container: HTMLElement) => press(container, { key: 'n', code: 'KeyN', keyCode: 78 })
  const undoSteps = (editor: DiagramEditor) => {
    let steps = 0
    while (editor.getState().canUndo) {
      editor.undo()
      steps++
    }
    return steps
  }

  describe('adding', () => {
    it('adds a sticky of the color of new stickies and edits its text, which is one undo step with it', () => {
      const { doc, editor } = open()

      const sticky = editor.addSticky({ x: 300, y: 250 })!

      expect(sticky.getGeometry()).toMatchObject({ x: 220, y: 170, width: 160, height: 160 })
      expect(sticky.getStyle()).toMatchObject({
        fillColor: STICKY_COLORS[0].value,
        strokeColor: 'none',
        shadow: true,
        whiteSpace: 'wrap',
        [TEXT_FIT_KEY]: true,
        fontSize: STICKY_FONT_SIZE,
      })
      expect(editor.getEditing()).toEqual({ cellId: sticky.getId(), changedRemotely: false })
      expect(editor.graph.getSelectionCells()).toEqual([sticky])

      typeAndApply(editor, 'Медленный CI')

      expect(dataOf(doc, sticky)?.value).toBe('Медленный CI')
      expect(undoSteps(editor)).toBe(1)
      expect(dataOf(doc, sticky)).toBeUndefined()
    })

    it('brings the sticky back with its text in one redo step', () => {
      const { doc, editor } = open()
      const sticky = editor.addSticky({ x: 300, y: 250 })!
      typeAndApply(editor, 'Идея')

      editor.undo()
      editor.redo()

      expect(dataOf(doc, sticky)?.value).toBe('Идея')
      expect(editor.getState().canRedo).toBe(false)
    })

    it('keeps the empty sticky when its text is cancelled, and the next undo step takes it away', () => {
      const { doc, editor } = open()
      const sticky = editor.addSticky({ x: 300, y: 250 })!
      cellEditor(editor).textarea!.textContent = 'Идея'

      editor.graph.stopEditing(true)

      expect(dataOf(doc, sticky)?.value).toBe('')
      expect(undoSteps(editor)).toBe(1)
      expect(dataOf(doc, sticky)).toBeUndefined()
    })

    it('makes later changes of the text undo steps of their own', () => {
      const { doc, editor } = open()
      const sticky = editor.addSticky({ x: 300, y: 250 })!
      typeAndApply(editor, 'Идея')

      editor.editLabel()
      typeAndApply(editor, 'Идея 2')
      editor.undo()

      expect(dataOf(doc, sticky)?.value).toBe('Идея')
      editor.undo()
      expect(dataOf(doc, sticky)).toBeUndefined()
    })

    it('joins no step that came after the sticky', () => {
      const { doc, editor } = open()
      const shape = editor.addShape('rectangle', { x: 600, y: 100 })!
      const sticky = editor.addSticky({ x: 300, y: 250 })!
      // Another change of the participant while the text is edited, e.g. through the panel of another tool.
      editor.graph.getDataModel().setValue(shape, 'API')

      typeAndApply(editor, 'Идея')

      editor.undo()
      expect(dataOf(doc, sticky)?.value).toBe('')
      expect(dataOf(doc, shape)?.value).toBe('API')
    })

    it('is seen by the other participant with its color and text', () => {
      const { alice, bob } = participants()
      alice.editor.addShape('rectangle', { x: 600, y: 100 })
      alice.editor.addSticky({ x: 300, y: 250 })
      typeAndApply(alice.editor, 'Медленный CI')

      const [sticky] = stickiesOf(bob.editor)
      expect(sticky?.getValue()).toBe('Медленный CI')
      expect(sticky?.getStyle().fillColor).toBe(STICKY_COLORS[0].value)
    })

    it('adds a sticky at the pointer over the canvas with N, or in the middle of the view without it', () => {
      const { editor, container } = open()
      container.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 500, clientY: 400 }))

      const event = pressN(container)

      // The key goes to no text: the new sticky starts empty.
      expect(event.defaultPrevented).toBe(true)
      const [first] = stickiesOf(editor)
      expect(first?.getGeometry()).toMatchObject({ x: 420, y: 320 })
      expect(editor.getEditing()?.cellId).toBe(first?.getId())
      typeAndApply(editor, 'Идея')

      container.dispatchEvent(new PointerEvent('pointerleave', { clientX: 900, clientY: 900 }))
      pressN(container)
      const center = editor.viewportCenter()
      expect(stickiesOf(editor)[1]?.getGeometry()).toMatchObject({
        x: Math.round((center.x - 80) / 10) * 10,
        y: Math.round((center.y - 80) / 10) * 10,
      })
    })

    it('adds a sticky with the key of N in a layout without Latin letters', () => {
      const { editor, container } = open()

      press(container, { key: 'т', code: 'KeyN', keyCode: 0 })

      expect(stickiesOf(editor)).toHaveLength(1)
    })

    it('steps a sticky aside from one that is already where N puts it', () => {
      const { editor, container } = open()
      container.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 500, clientY: 400 }))

      pressN(container)
      editor.graph.stopEditing(false)
      pressN(container)

      expect(stickiesOf(editor).map((cell) => [cell.getGeometry()!.x, cell.getGeometry()!.y])).toEqual([
        [420, 320],
        [440, 340],
      ])
    })

    it('turns the laser pointer and the comment tool off', () => {
      const { editor, container } = open()
      editor.setLaser(true)

      pressN(container)

      expect(editor.getState().laser).toBe(false)
      expect(stickiesOf(editor)).toHaveLength(1)
    })

    it('adds a sticky with a double click with Ctrl on the empty canvas only', () => {
      const { editor, container } = open()
      const shape = editor.addShape('rectangle', { x: 600, y: 100 })!
      const doubleClick = (target: Element, ctrlKey: boolean, clientX = 300, clientY = 250) =>
        target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, ctrlKey, clientX, clientY }))

      doubleClick(container, false)
      expect(stickiesOf(editor)).toHaveLength(0)

      doubleClick(container, true)
      const [sticky] = stickiesOf(editor)
      expect(sticky?.getGeometry()).toMatchObject({ x: 220, y: 170 })
      expect(editor.getEditing()?.cellId).toBe(sticky?.getId())
      editor.graph.stopEditing(false)

      // A double click on a shape edits its label, Ctrl or not.
      const node = editor.graph.getView().getState(shape)!.shape!.node as Element
      doubleClick(node, true, 600, 100)
      expect(stickiesOf(editor)).toHaveLength(1)
      expect(editor.getEditing()?.cellId).toBe(shape.getId())
    })

    it('adds nothing for a participant who may only view', () => {
      const { doc } = open()
      const { editor, container } = open({ doc, readOnly: true })

      expect(editor.addSticky({ x: 300, y: 250 })).toBeNull()
      pressN(container)
      container.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, ctrlKey: true, clientX: 300, clientY: 250 }))

      expect(stickiesOf(editor)).toHaveLength(0)
    })
  })

  describe('the panel', () => {
    it('tells the color, the text fit and the lock of the selected stickies, and only of them', () => {
      const { editor } = open()
      const shape = editor.addShape('rectangle', { x: 600, y: 100 })!
      const sticky = editor.addSticky({ x: 300, y: 250 })!
      editor.graph.stopEditing(false)

      editor.graph.setSelectionCell(shape)
      expect(editor.getState().stickies).toBeNull()

      editor.graph.setSelectionCells([shape, sticky])
      expect(editor.getState().stickies).toEqual({
        cellIds: [sticky.getId()],
        color: STICKY_COLORS[0].value,
        textFit: true,
        locked: false,
      })
    })

    it('recolors the selected stickies that are not locked in one undo step and keeps the color for new ones', () => {
      const { alice, bob } = participants()
      const shape = alice.editor.addShape('rectangle', { x: 600, y: 100 })!
      const stickies = [alice.editor.addSticky({ x: 100, y: 400 })!, alice.editor.addSticky({ x: 400, y: 400 })!]
      const locked = alice.editor.addSticky({ x: 700, y: 400 })!
      alice.editor.graph.setSelectionCell(locked)
      alice.editor.setLocked(true)
      alice.editor.graph.setSelectionCells([shape, ...stickies, locked])

      alice.editor.setStickyColor('#f8cecc')

      expect(stickies.map((cell) => theirs(bob.editor, cell).getStyle().fillColor)).toEqual(['#f8cecc', '#f8cecc'])
      expect(theirs(bob.editor, locked).getStyle().fillColor).toBe(STICKY_COLORS[0].value)
      expect(theirs(bob.editor, shape).getStyle().fillColor).toBeUndefined()
      expect(alice.editor.getState().stickies?.color).toBeNull()

      alice.editor.undo()
      expect(stickies.map((cell) => theirs(bob.editor, cell).getStyle().fillColor)).toEqual([
        STICKY_COLORS[0].value,
        STICKY_COLORS[0].value,
      ])

      expect(alice.editor.addSticky({ x: 100, y: 700 })!.getStyle().fillColor).toBe('#f8cecc')
    })

    it('keeps the color for new stickies when no sticky can change, and is disabled for locked ones', () => {
      const { editor } = open()
      const sticky = editor.addSticky({ x: 300, y: 250 })!
      editor.graph.stopEditing(false)
      editor.setLocked(true)
      expect(editor.getState().stickies?.locked).toBe(true)

      editor.setStickyColor('#d5e8d4')

      expect(sticky.getStyle().fillColor).toBe(STICKY_COLORS[0].value)
      expect(editor.addShape('sticky', { x: 600, y: 600 })!.getStyle().fillColor).toBe('#d5e8d4')
    })

    it('shows nothing to a participant who may only view', () => {
      const { doc, editor: owner } = open()
      const sticky = owner.addSticky({ x: 300, y: 250 })!
      owner.graph.stopEditing(false)
      const { editor } = open({ doc, readOnly: true })

      editor.graph.setSelectionCell(theirs(editor, sticky))

      expect(editor.getState().stickies).toBeNull()
    })
  })

  describe('the size of the text', () => {
    it('fits a long text in the step that writes it, the same for the other participant', () => {
      const { alice, bob } = participants()
      const sticky = alice.editor.addSticky({ x: 300, y: 250 })!

      typeAndApply(alice.editor, LONG_TEXT)

      expect(theirs(bob.editor, sticky).getStyle().fontSize).toBe(12)
      // The lines are wrapped by the width, at the stored size.
      expect(bob.editor.graph.getLabel(theirs(bob.editor, sticky))?.split('\n')).toHaveLength(8)
      alice.editor.undo()
      expect(theirs(bob.editor, sticky)).toBeUndefined()
    })

    it('keeps a short text at the largest size', () => {
      const { editor } = open()
      const sticky = editor.addSticky({ x: 300, y: 250 })!

      typeAndApply(editor, 'Идея')

      expect(sticky.getStyle().fontSize).toBe(STICKY_FONT_SIZE)
    })

    it('fits the text again when the sticky is resized or its font changes, but not when it moves or is recolored', () => {
      const { editor } = open()
      const sticky = editor.addSticky({ x: 300, y: 250 })!
      typeAndApply(editor, LONG_TEXT)
      editor.graph.setSelectionCell(sticky)

      editor.moveSelection(10, 0)
      editor.setStickyColor('#dae8fc')
      expect(sticky.getStyle().fontSize).toBe(12)

      editor.setGeometry({ width: 320, height: 320 })
      expect(sticky.getStyle().fontSize).toBe(STICKY_FONT_SIZE)
      editor.undo()
      expect(sticky.getStyle().fontSize).toBe(12)

      editor.toggleFontStyle('bold')
      expect(sticky.getStyle().fontSize).toBe(12)
      editor.setTextWrap(false)
      // One line of 179 characters.
      expect(sticky.getStyle().fontSize).toBe(6)
    })

    it('stops fitting the text of stickies whose text size is set by hand, until fitting is turned on again', () => {
      const { doc, editor } = open()
      const sticky = editor.addSticky({ x: 300, y: 250 })!
      typeAndApply(editor, 'Идея')
      editor.graph.setSelectionCell(sticky)

      editor.setFontSize(28)
      expect(editor.getState().stickies?.textFit).toBe(false)
      editor.editLabel()
      typeAndApply(editor, LONG_TEXT)
      expect(dataOf(doc, sticky)?.style).toMatchObject({ fontSize: 28 })
      expect(dataOf(doc, sticky)?.style).not.toHaveProperty(TEXT_FIT_KEY)

      editor.setTextFit(true)
      expect(dataOf(doc, sticky)?.style).toMatchObject({ fontSize: 12, [TEXT_FIT_KEY]: true })
      expect(editor.getState().stickies?.textFit).toBe(true)
      editor.undo()
      expect(dataOf(doc, sticky)?.style).toMatchObject({ fontSize: 28 })
    })

    it('turns fitting and auto width off each other', () => {
      const { editor } = open()
      const sticky = editor.addSticky({ x: 300, y: 250 })!
      editor.graph.stopEditing(false)

      editor.setAutoWidth(true)
      expect(sticky.getStyle()).not.toHaveProperty(TEXT_FIT_KEY)
      expect(editor.getState().stickies?.textFit).toBe(false)

      editor.setTextFit(true)
      expect(sticky.getStyle()).toMatchObject({ [TEXT_FIT_KEY]: true })
      expect(sticky.getStyle()).not.toHaveProperty('autosize')
    })
  })

  describe('who wrote a sticky', () => {
    it('keeps who wrote the text, which moving and recoloring keep and the undo of a change of the text brings back', () => {
      const { alice, bob } = participants()
      const sticky = alice.editor.addSticky({ x: 300, y: 250 })!
      expect(readTextAuthor(getCells(bob.doc).get(sticky.getId()!))).toBeNull()

      typeAndApply(alice.editor, 'Медленный CI')
      expect(bob.editor.stickySignatures()).toEqual([
        { cellId: sticky.getId(), by: ALICE.id, name: 'Алиса', color: '#1f2328' },
      ])

      bob.editor.graph.setSelectionCell(theirs(bob.editor, sticky))
      bob.editor.moveSelection(40, 0)
      bob.editor.setStickyColor('#f8cecc')
      expect(alice.editor.stickySignatures().map((signature) => signature.name)).toEqual(['Алиса'])

      bob.editor.editLabel()
      typeAndApply(bob.editor, 'Быстрый CI')
      expect(alice.editor.stickySignatures().map((signature) => signature.name)).toEqual(['Боб'])
      bob.editor.undo()
      expect(alice.editor.stickySignatures().map((signature) => signature.name)).toEqual(['Алиса'])
    })

    it('forgets who wrote a text that is gone, and keeps nothing for other shapes', () => {
      const { doc, editor } = open()
      const shape = editor.addShape('rectangle', { x: 600, y: 100 })!
      editor.graph.getDataModel().setValue(shape, 'API')
      const sticky = editor.addSticky({ x: 300, y: 250 })!
      typeAndApply(editor, 'Идея')

      editor.editLabel()
      typeAndApply(editor, '')

      expect(getCells(doc).get(sticky.getId()!)!.has(TEXT_AUTHOR_KEY)).toBe(false)
      expect(getCells(doc).get(shape.getId()!)!.has(TEXT_AUTHOR_KEY)).toBe(false)
      expect(editor.stickySignatures()).toEqual([])
    })

    it('shows no signature on a sticky whose text is being edited or that is turned', () => {
      const { editor } = open()
      const sticky = editor.addSticky({ x: 300, y: 250 })!
      typeAndApply(editor, 'Идея')
      expect(editor.stickySignatures()).toHaveLength(1)

      editor.editLabel()
      expect(editor.stickySignatures()).toEqual([])
      editor.graph.stopEditing(true)

      editor.setRotation(15)
      expect(editor.stickySignatures()).toEqual([])
      expect(sticky.getStyle().rotation).toBe(15)
    })

    it('signs a pasted copy of a sticky with who pasted it', () => {
      const { alice, bob } = participants()
      const sticky = alice.editor.addSticky({ x: 300, y: 250 })!
      typeAndApply(alice.editor, 'Идея')

      bob.editor.graph.setSelectionCell(theirs(bob.editor, sticky))
      bob.editor.duplicate()

      expect(alice.editor.stickySignatures().map((signature) => signature.name)).toEqual(['Алиса', 'Боб'])
    })
  })
})
