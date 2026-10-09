import type { Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { PageHistories } from './binding.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { DEFAULT_PAGE_ID, ELEMENT_KEY, getCells, getElements, initializeDocument, readCell } from './model.ts'
import { readAttribution } from './attribution.ts'
import { addPage, deletePage } from './pages.ts'
import { connect } from './testing.ts'
import type { ShapeId } from './shapes.ts'

describe('one element on several pages in the editor', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    document.body.replaceChildren()
  })

  /** A board with two pages and their histories, as the page of a board keeps them. */
  function board() {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const second = addPage(doc, DEFAULT_PAGE_ID)
    return { doc, second, histories: new PageHistories(doc) }
  }

  function open(doc: Y.Doc, pageId: string, histories: PageHistories | null = null, readOnly = false) {
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, {
      pageId,
      readOnly,
      participantName: 'Алиса',
      participantId: 'alice',
      undoManager: histories?.get(pageId),
    })
    editors.push(editor)
    return editor
  }

  function shape(editor: DiagramEditor, id: ShapeId, label: string, at = { x: 200, y: 200 }): Cell {
    const cell = editor.addShape(id, at)!
    editor.graph.getDataModel().setValue(cell, label)
    editor.graph.setSelectionCell(cell)
    return cell
  }

  const stored = (doc: Y.Doc, pageId: string, id: string) => readCell(id, getCells(doc, pageId).get(id)!)
  const elementIdOf = (doc: Y.Doc, pageId: string, id: string) => stored(doc, pageId, id).style[ELEMENT_KEY]
  const shapesOf = (editor: DiagramEditor) => editor.graph.getDefaultParent().getChildren().filter((cell) => cell.isVertex())

  it('pastes a copy as a cell of the same element on another page, and a change of it changes the first', () => {
    const { doc, second, histories } = board()
    const first = open(doc, DEFAULT_PAGE_ID, histories)
    const payments = shape(first, 'c4-container', 'Payments\n[Container: Kotlin]')
    first.setElementProperties(payments.getId()!, { owner: 'Платежи' })
    first.copy()
    first.destroy()

    const other = open(doc, second, histories)
    other.pasteAsSameElement({ x: 100, y: 100 })
    const pasted = shapesOf(other)[0]!
    other.setElementProperties(pasted.getId()!, { name: 'Billing' })

    const id = elementIdOf(doc, DEFAULT_PAGE_ID, payments.getId()!)
    expect(elementIdOf(doc, second, pasted.getId()!)).toBe(id)
    expect(stored(doc, DEFAULT_PAGE_ID, payments.getId()!).value).toBe('Billing\n[Container: Kotlin]')
    expect(other.selectedElement()).toMatchObject({
      elementId: id,
      places: [
        { pageId: DEFAULT_PAGE_ID, cellIds: [payments.getId()] },
        { pageId: second, cellIds: [pasted.getId()] },
      ],
    })
  })

  it('pastes with the properties of the element now, not those it had when it was copied', () => {
    const { doc } = board()
    const editor = open(doc, DEFAULT_PAGE_ID)
    const api = shape(editor, 'c4-container', 'API\n[Container: Java]')
    editor.setElementProperties(api.getId()!, { owner: 'Заказы' })
    editor.copy()
    editor.setElementProperties(api.getId()!, { technology: 'Go' })

    editor.pasteAsSameElement({ x: 500, y: 100 })
    const pasted = editor.graph.getSelectionCell()

    expect(pasted.getValue()).toBe('API\n[Container: Go]')
    expect(getElements(doc).get(elementIdOf(doc, DEFAULT_PAGE_ID, api.getId()!) as string)!.get('technology')).toBe('Go')
  })

  it('makes the copied shape an element with the pasted cell, in one undo step', () => {
    const { doc, histories } = board()
    const editor = open(doc, DEFAULT_PAGE_ID, histories)
    const cache = shape(editor, 'cache', 'Кэш')
    editor.copy()

    editor.pasteAsSameElement({ x: 500, y: 100 })
    const pasted = editor.graph.getSelectionCell()

    const id = elementIdOf(doc, DEFAULT_PAGE_ID, cache.getId()!)
    expect(id).toEqual(expect.any(String))
    expect(elementIdOf(doc, DEFAULT_PAGE_ID, pasted.getId()!)).toBe(id)
    expect((cache.getStyle() as Record<string, unknown>)[ELEMENT_KEY]).toBe(id)

    editor.undo()
    expect(shapesOf(editor)).toHaveLength(1)
    expect(elementIdOf(doc, DEFAULT_PAGE_ID, cache.getId()!)).toBeUndefined()
  })

  it('keeps the element of cut cells pasted as the same element on another page', () => {
    const { doc, second } = board()
    const first = open(doc, DEFAULT_PAGE_ID)
    const api = shape(first, 'c4-container', 'API\n[Container: Java]')
    first.setElementProperties(api.getId()!, { owner: 'Заказы' })
    const id = elementIdOf(doc, DEFAULT_PAGE_ID, api.getId()!)
    first.cut()
    first.destroy()

    const other = open(doc, second)
    other.pasteAsSameElement()
    const pasted = shapesOf(other)[0]!

    expect(elementIdOf(doc, second, pasted.getId()!)).toBe(id)
    expect(getElements(doc).get(id as string)!.toJSON()).toMatchObject({ name: 'API', technology: 'Java', owner: 'Заказы' })
  })

  it('pastes new elements with an ordinary paste and on another board', () => {
    const { doc } = board()
    const editor = open(doc, DEFAULT_PAGE_ID)
    const api = shape(editor, 'c4-container', 'API\n[Container: Java]')
    editor.setElementProperties(api.getId()!, { owner: 'Заказы' })
    editor.copy()

    editor.paste({ x: 500, y: 100 })
    const copy = editor.graph.getSelectionCell()
    const another = new Y.Doc()
    initializeDocument(another)
    const elsewhere = open(another, DEFAULT_PAGE_ID)
    elsewhere.pasteAsSameElement({ x: 100, y: 100 })
    const foreign = shapesOf(elsewhere)[0]!

    const id = elementIdOf(doc, DEFAULT_PAGE_ID, api.getId()!)
    expect(elementIdOf(doc, DEFAULT_PAGE_ID, copy.getId()!)).not.toBe(id)
    expect(elementIdOf(another, DEFAULT_PAGE_ID, foreign.getId()!)).not.toBe(id)
    expect(stored(another, DEFAULT_PAGE_ID, foreign.getId()!).style).toMatchObject({ codrawOwner: 'Заказы' })
  })

  it('adds a cell of an element of another page with its look, and of a shape that is no element yet', () => {
    const { doc, second, histories } = board()
    const first = open(doc, DEFAULT_PAGE_ID)
    const api = shape(first, 'c4-container', 'API\n[Container: Java]')
    first.setElementProperties(api.getId()!, { owner: 'Заказы' })
    first.graph.getDataModel().setStyle(api, { ...api.getStyle(), fillColor: '#ff0000' })
    const cache = shape(first, 'cache', 'Кэш', { x: 600, y: 200 })
    const id = elementIdOf(doc, DEFAULT_PAGE_ID, api.getId()!) as string
    first.destroy()

    const other = open(doc, second, histories)
    other.placeElement({ elementId: id }, { x: 300, y: 300 })
    const added = other.graph.getSelectionCell()
    other.placeElement({ cell: { pageId: DEFAULT_PAGE_ID, cellId: cache.getId()! } }, { x: 600, y: 300 })
    const cached = other.graph.getSelectionCell()

    expect(stored(doc, second, added.getId()!)).toMatchObject({
      value: 'API\n[Container: Java]',
      geometry: { width: 240, height: 120 },
      style: { [ELEMENT_KEY]: id, fillColor: '#ff0000' },
    })
    expect(elementIdOf(doc, second, cached.getId()!)).toBe(elementIdOf(doc, DEFAULT_PAGE_ID, cache.getId()!))
    other.undo()
    expect(elementIdOf(doc, DEFAULT_PAGE_ID, cache.getId()!)).toBeUndefined()
  })

  it('detaches a cell into an element of its own', () => {
    const { doc } = board()
    const editor = open(doc, DEFAULT_PAGE_ID)
    const api = shape(editor, 'c4-container', 'API\n[Container: Java]')
    editor.setElementProperties(api.getId()!, { owner: 'Заказы' })
    editor.copy()
    editor.pasteAsSameElement({ x: 500, y: 100 })
    const pasted = editor.graph.getSelectionCell()

    editor.detachElement(pasted.getId()!)
    editor.setElementProperties(pasted.getId()!, { name: 'api-pod' })

    expect(elementIdOf(doc, DEFAULT_PAGE_ID, pasted.getId()!)).not.toBe(elementIdOf(doc, DEFAULT_PAGE_ID, api.getId()!))
    expect(api.getValue()).toBe('API\n[Container: Java]')
    expect(pasted.getValue()).toBe('api-pod\n[Container: Java]')
  })

  it('merges the selected shapes into one element with the properties chosen, in one undo step', () => {
    const { doc, histories } = board()
    const editor = open(doc, DEFAULT_PAGE_ID, histories)
    const payments = shape(editor, 'c4-container', 'Payments\n[Container: Kotlin]')
    editor.setElementProperties(payments.getId()!, { owner: 'Платежи' })
    const other = shape(editor, 'c4-container', 'payments\n[Container]', { x: 600, y: 200 })
    editor.graph.setSelectionCells([payments, other])

    expect(editor.getState().canMergeElements).toBe(true)
    expect(editor.mergeCandidates().map((candidate) => candidate.properties.name)).toEqual(['Payments', 'payments'])
    editor.mergeElements(payments.getId()!)

    expect(elementIdOf(doc, DEFAULT_PAGE_ID, other.getId()!)).toBe(elementIdOf(doc, DEFAULT_PAGE_ID, payments.getId()!))
    expect(other.getValue()).toBe('Payments\n[Container: Kotlin]')
    editor.undo()
    expect(other.getValue()).toBe('payments\n[Container]')
    expect(elementIdOf(doc, DEFAULT_PAGE_ID, other.getId()!)).toBeUndefined()
  })

  it('does not merge shapes that stand for nothing, such as rectangles', () => {
    const { doc } = board()
    const editor = open(doc, DEFAULT_PAGE_ID)
    const boxes = [shape(editor, 'rectangle', 'A'), shape(editor, 'rectangle', 'B', { x: 500, y: 200 })]

    editor.graph.setSelectionCells(boxes)

    expect(editor.getState().canMergeElements).toBe(false)
    expect(editor.mergeCandidates()).toEqual([])
  })

  it('merges shapes of other pages, as the checks offer it for probable duplicates, in one undo step of the page', () => {
    const { doc, second, histories } = board()
    const first = open(doc, DEFAULT_PAGE_ID, histories)
    const ledger = shape(first, 'c4-container', 'Ledger\n[Container: Kotlin]')
    const locked = shape(first, 'c4-container', 'Ledger\n[Container: Go]', { x: 600, y: 200 })
    first.setLocked(true)
    const other = open(doc, second, histories)
    const copy = shape(other, 'c4-container', 'ledger\n[Container]')
    const refs = [
      { pageId: DEFAULT_PAGE_ID, cellId: ledger.getId()! },
      { pageId: DEFAULT_PAGE_ID, cellId: locked.getId()! },
      { pageId: second, cellId: copy.getId()! },
    ]

    expect(open(doc, second, null, true).mergeElementCells(refs, refs[0]!)).toBe(false)
    expect(other.mergeElementCells(refs, refs[1]!)).toBe(false)
    expect(other.mergeElementCells(refs, refs[0]!)).toBe(true)

    expect(elementIdOf(doc, second, copy.getId()!)).toBe(elementIdOf(doc, DEFAULT_PAGE_ID, ledger.getId()!))
    expect(copy.getValue()).toBe('Ledger\n[Container: Kotlin]')
    // The locked shape stays out.
    expect(elementIdOf(doc, DEFAULT_PAGE_ID, locked.getId()!)).not.toBe(elementIdOf(doc, DEFAULT_PAGE_ID, ledger.getId()!))
    other.undo()
    expect(copy.getValue()).toBe('ledger\n[Container]')
    expect(elementIdOf(doc, second, copy.getId()!)).toBeUndefined()
  })

  it('removes the element from all pages with its edges, in one undo step of the page', () => {
    const { doc, second, histories } = board()
    const first = open(doc, DEFAULT_PAGE_ID, histories)
    const api = shape(first, 'c4-container', 'API\n[Container: Java]')
    first.setElementProperties(api.getId()!, { owner: 'Заказы' })
    first.copy()
    first.destroy()
    const other = open(doc, second, histories)
    other.pasteAsSameElement({ x: 100, y: 100 })
    const pasted = shapesOf(other)[0]!
    const db = shape(other, 'database', 'БД', { x: 600, y: 100 })
    other.graph.insertEdge({ parent: other.graph.getDefaultParent(), source: pasted, target: db })
    other.graph.setSelectionCell(pasted)

    other.deleteElementEverywhere(pasted.getId()!)

    expect(getCells(doc).has(api.getId()!)).toBe(false)
    expect(shapesOf(other)).toEqual([db])
    expect(other.graph.getDefaultParent().getChildren().filter((cell) => cell.isEdge())).toHaveLength(0)
    other.undo()
    expect(getCells(doc).has(api.getId()!)).toBe(true)
    expect(shapesOf(other)).toHaveLength(2)
  })

  it('changes nothing for a participant who may only view, and keeps locked cells as they are', () => {
    const { doc } = board()
    const editor = open(doc, DEFAULT_PAGE_ID)
    const api = shape(editor, 'c4-container', 'API\n[Container: Java]')
    editor.setElementProperties(api.getId()!, { owner: 'Заказы' })
    editor.copy()
    editor.pasteAsSameElement({ x: 500, y: 100 })
    editor.graph.setSelectionCell(api)
    editor.setLocked(true)

    editor.detachElement(api.getId()!)
    editor.deleteElementEverywhere(api.getId()!)
    expect(editor.selectedElement()).toMatchObject({ canChange: false })
    expect(shapesOf(editor)).toHaveLength(2)

    const viewer = open(doc, DEFAULT_PAGE_ID, null, true)
    viewer.pasteAsSameElement({ x: 0, y: 0 })
    viewer.placeElement({ elementId: elementIdOf(doc, DEFAULT_PAGE_ID, api.getId()!) as string }, { x: 0, y: 0 })
    expect(getCells(doc).size).toBe(4)
  })

  it('shows a change of the owner on the second cell of the element on the page, whose move keeps it', () => {
    const { doc } = board()
    const editor = open(doc, DEFAULT_PAGE_ID)
    const payments = shape(editor, 'c4-container', 'Payments\n[Container]')
    editor.copy()
    editor.pasteAsSameElement({ x: 600, y: 200 })
    const second = editor.graph.getSelectionCell()

    editor.setElementProperties(payments.getId()!, { owner: 'Платежи', tags: ['pci'] })
    editor.graph.setSelectionCell(second)
    expect(editor.getState().properties).toMatchObject({ properties: { owner: 'Платежи', tags: ['pci'] } })
    editor.moveSelection(10, 0)

    expect(getElements(doc).get(elementIdOf(doc, DEFAULT_PAGE_ID, payments.getId()!) as string)!.toJSON()).toMatchObject({
      owner: 'Платежи',
      tags: ['pci'],
    })
  })

  it('pastes the copy of a locked shape without changing it, as a new element', () => {
    const { doc, second } = board()
    const first = open(doc, DEFAULT_PAGE_ID)
    const locked = shape(first, 'c4-container', 'Payments\n[Container: технология]\nОписание')
    first.setLocked(true)
    first.copy()
    first.destroy()

    const other = open(doc, second)
    other.pasteAsSameElement({ x: 100, y: 100 })

    expect(stored(doc, DEFAULT_PAGE_ID, locked.getId()!).style).not.toHaveProperty(ELEMENT_KEY)
    expect(stored(doc, DEFAULT_PAGE_ID, locked.getId()!).value).toBe('Payments\n[Container: технология]\nОписание')
    expect(shapesOf(other)).toHaveLength(1)
  })

  it('pastes two cells of one element as cells of one new element', () => {
    const { doc } = board()
    const editor = open(doc, DEFAULT_PAGE_ID)
    const api = shape(editor, 'c4-container', 'API\n[Container: Java]')
    editor.setElementProperties(api.getId()!, { owner: 'Заказы' })
    editor.copy()
    editor.pasteAsSameElement({ x: 600, y: 200 })
    const again = editor.graph.getSelectionCell()
    editor.graph.setSelectionCells([api, again])
    editor.copy()

    editor.paste({ x: 100, y: 500 })
    const copies = editor.graph.getSelectionCells()

    const ids = copies.map((copy) => elementIdOf(doc, DEFAULT_PAGE_ID, copy.getId()!))
    expect(ids[0]).not.toBe(elementIdOf(doc, DEFAULT_PAGE_ID, api.getId()!))
    expect(ids[1]).toBe(ids[0])
  })

  it('pastes a copy as a cell of the element its shape has now, after it was merged into another', () => {
    const { doc } = board()
    const editor = open(doc, DEFAULT_PAGE_ID)
    const payments = shape(editor, 'c4-container', 'Payments\n[Container]')
    editor.setElementProperties(payments.getId()!, { owner: 'Платежи' })
    const billing = shape(editor, 'c4-container', 'Billing\n[Container]', { x: 600, y: 200 })
    editor.setElementProperties(billing.getId()!, { owner: 'Биллинг' })
    editor.graph.setSelectionCell(payments)
    editor.copy()
    editor.graph.setSelectionCells([payments, billing])
    editor.mergeElements(billing.getId()!)

    editor.pasteAsSameElement({ x: 100, y: 500 })
    const pasted = editor.graph.getSelectionCell()

    expect(elementIdOf(doc, DEFAULT_PAGE_ID, pasted.getId()!)).toBe(elementIdOf(doc, DEFAULT_PAGE_ID, billing.getId()!))
    expect(pasted.getValue()).toBe('Billing\n[Container]')
    expect(getElements(doc).size).toBe(1)
  })

  it('leaves no cells of a deleted page when an undo brings back what was removed from all pages', () => {
    const { doc, second, histories } = board()
    const first = open(doc, DEFAULT_PAGE_ID, histories)
    const api = shape(first, 'c4-container', 'API\n[Container]')
    first.copy()
    first.destroy()
    const other = open(doc, second, histories)
    other.pasteAsSameElement({ x: 100, y: 100 })
    other.destroy()
    const back = open(doc, DEFAULT_PAGE_ID, histories)
    back.graph.setSelectionCell(back.graph.getDataModel().getCell(api.getId()!)!)
    back.deleteElementEverywhere(api.getId()!)
    deletePage(doc, second)

    back.undo()

    expect(getCells(doc).has(api.getId()!)).toBe(true)
    expect(getCells(doc, second).size).toBe(0)
  })

  it('makes one element, no second one left over, of a shape whose properties two participants change at the same time', () => {
    const { doc } = board()
    const editor = open(doc, DEFAULT_PAGE_ID)
    const cache = shape(editor, 'cache', 'Кэш')
    const theirs = new Y.Doc()
    Y.applyUpdate(theirs, Y.encodeStateAsUpdate(doc))
    const network = connect(doc, theirs)
    const their = open(theirs, DEFAULT_PAGE_ID)
    network.disconnect()

    editor.setElementProperties(cache.getId()!, { technology: 'Redis' })
    their.setElementProperties(cache.getId()!, { owner: 'Платформа' })
    network.reconnect()

    // Both made the element named by the cell; one of the two new elements stays, as a change of one key would.
    expect([...getElements(doc).keys()]).toEqual([cache.getId()])
    expect([...getElements(theirs).keys()]).toEqual([cache.getId()])
    expect(elementIdOf(doc, DEFAULT_PAGE_ID, cache.getId()!)).toBe(cache.getId())
  })

  it('names who merged or detached in the cells it changed, on other pages too', () => {
    const { doc, second } = board()
    const first = open(doc, DEFAULT_PAGE_ID)
    const api = shape(first, 'c4-container', 'API\n[Container]')
    first.copy()
    first.destroy()
    const other = open(doc, second)
    other.pasteAsSameElement({ x: 100, y: 100 })

    expect(readAttribution(getCells(doc).get(api.getId()!))).toMatchObject({ name: 'Алиса' })
  })
})
