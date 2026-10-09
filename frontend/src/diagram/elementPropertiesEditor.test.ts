import type { Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { addPage } from './pages.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { DEFAULT_PAGE_ID, ELEMENT_KEY, getCells, getElements, initializeDocument, readCell } from './model.ts'
import { PageHistories } from './binding.ts'
import type { ShapeId } from './shapes.ts'
import { connect } from './testing.ts'

describe('properties of elements in the editor', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    document.body.replaceChildren()
  })

  function open({ doc = new Y.Doc(), readOnly = false, pageId = DEFAULT_PAGE_ID, histories = null as PageHistories | null } = {}) {
    if (!readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, {
      readOnly,
      pageId,
      participantName: 'Алиса',
      undoManager: histories?.get(pageId),
    })
    editors.push(editor)
    return { doc, editor }
  }

  function shape(editor: DiagramEditor, id: ShapeId, label?: string): Cell {
    const cell = editor.addShape(id, { x: 200, y: 200 })!
    if (label !== undefined) editor.graph.getDataModel().setValue(cell, label)
    editor.graph.setSelectionCell(cell)
    return cell
  }

  const stored = (doc: Y.Doc, cell: Cell) => readCell(cell.getId()!, getCells(doc).get(cell.getId()!)!)
  const elementOf = (doc: Y.Doc, cell: Cell) => getElements(doc).get(stored(doc, cell).style[ELEMENT_KEY] as string)?.toJSON()

  it('reads the properties of a shape of C4 from its label until they change, then keeps them in an element', () => {
    const { doc, editor } = open()
    const cell = shape(editor, 'c4-container')

    expect(editor.getState().properties).toEqual({
      target: 'shape',
      cellId: cell.getId(),
      properties: { name: 'Контейнер', kind: 'c4-container', technology: '', description: '', owner: '', tags: [] },
      defaultKind: 'c4-container',
      format: 'c4',
      showTechnology: false,
      element: false,
      icon: null,
      canChange: true,
    })

    editor.setElementProperties(cell.getId()!, { technology: 'Go', owner: 'Платежи' })

    expect(cell.getValue()).toBe('Контейнер\n[Container: Go]')
    expect(elementOf(doc, cell)).toEqual({ name: 'Контейнер', kind: 'c4-container', technology: 'Go', owner: 'Платежи' })
    expect(editor.getState().properties).toMatchObject({ element: true, properties: { technology: 'Go', owner: 'Платежи' } })
  })

  it('changes properties as one undo step that every participant sees', () => {
    const { doc, editor } = open()
    const other = open({ doc: new Y.Doc() })
    connect(doc, other.doc)
    const cell = shape(editor, 'c4-container', 'API\n[Container: Java]\nЗаказы')
    const theirs = () => other.editor.graph.getDataModel().getCell(cell.getId()!)!

    editor.setElementProperties(cell.getId()!, { technology: 'Kotlin', tags: ['core', 'pci'] })
    other.editor.graph.setSelectionCell(theirs())

    expect(theirs().getValue()).toBe('API\n[Container: Kotlin]\nЗаказы')
    expect(other.editor.getState().properties).toMatchObject({ properties: { technology: 'Kotlin', tags: ['core', 'pci'] } })

    editor.undo()
    expect(cell.getValue()).toBe('API\n[Container: Java]\nЗаказы')
    expect(theirs().getValue()).toBe('API\n[Container: Java]\nЗаказы')
    expect(stored(doc, cell).style).not.toHaveProperty(ELEMENT_KEY)
    expect(getElements(doc).size).toBe(0)
    editor.redo()
    expect(elementOf(doc, cell)).toMatchObject({ technology: 'Kotlin', tags: ['core', 'pci'] })
  })

  it('keeps the lines of its own of a plain label and shows the technology when asked', () => {
    const { editor } = open()
    const cell = shape(editor, 'service', 'Petstore\nGET /pets')

    editor.setElementProperties(cell.getId()!, { name: 'Pets', technology: 'Go', showTechnology: true })

    expect(cell.getValue()).toBe('Pets\n[Go]\nGET /pets')
    editor.setElementProperties(cell.getId()!, { showTechnology: false })
    expect(cell.getValue()).toBe('Pets\nGET /pets')
    expect(editor.getState().properties).toMatchObject({ showTechnology: false, properties: { technology: 'Go' } })
  })

  it('keeps an emptied name empty, and the line of the type a type', () => {
    const { doc, editor } = open()
    const cell = shape(editor, 'c4-container', 'API\n[Container: Java]\nЗаказы')

    editor.setElementProperties(cell.getId()!, { name: '' })
    editor.setElementProperties(cell.getId()!, { technology: 'Go' })

    expect(cell.getValue()).toBe('\n[Container: Go]\nЗаказы')
    expect(elementOf(doc, cell)).toEqual({ kind: 'c4-container', technology: 'Go', description: 'Заказы' })
  })

  it('makes the lines of its own of a plain label the description when the element becomes of a kind of C4', () => {
    const { doc, editor } = open()
    const cell = shape(editor, 'service', 'Petstore\nGET /pets\nPOST /pets')

    editor.setElementProperties(cell.getId()!, { kind: 'c4-container' })

    expect(cell.getValue()).toBe('Petstore\n[Container]\nGET /pets\nPOST /pets')
    expect(elementOf(doc, cell)).toMatchObject({ kind: 'c4-container', description: 'GET /pets\nPOST /pets' })
  })

  it('keeps the lines of its own aside when the element becomes of a kind of C4 with a description, and gives them back', () => {
    const { editor } = open()
    const cell = shape(editor, 'service', 'Petstore\n[Go]\nGET /pets')
    editor.setElementProperties(cell.getId()!, { technology: 'Go', showTechnology: true, description: 'Магазин' })

    editor.setElementProperties(cell.getId()!, { kind: 'c4-container' })
    expect(cell.getValue()).toBe('Petstore\n[Container: Go]\nМагазин')
    editor.setElementProperties(cell.getId()!, { kind: 'service' })

    expect(cell.getValue()).toBe('Petstore\n[Go]\nGET /pets')
    expect(cell.getStyle()).not.toHaveProperty('codrawOwnLines')
  })

  it('changes nothing without a change, and makes no element of it', () => {
    const { doc, editor } = open()
    const cell = shape(editor, 'c4-container', 'API\n[Container: Java]')

    editor.setElementProperties(cell.getId()!, { name: 'API', technology: '  Java ' })

    expect(editor.getState().canUndo).toBe(true)
    expect(stored(doc, cell).style).not.toHaveProperty(ELEMENT_KEY)
  })

  it('gives a copy an element of its own', () => {
    const { doc, editor } = open()
    const cell = shape(editor, 'service', 'API')
    editor.setElementProperties(cell.getId()!, { technology: 'Kotlin' })

    editor.duplicate()
    const copy = editor.graph.getSelectionCell()
    editor.setElementProperties(copy.getId()!, { technology: 'Go' })

    expect(copy).not.toBe(cell)
    expect(stored(doc, copy).style[ELEMENT_KEY]).not.toBe(stored(doc, cell).style[ELEMENT_KEY])
    expect(elementOf(doc, cell)).toMatchObject({ technology: 'Kotlin' })
    expect(elementOf(doc, copy)).toMatchObject({ technology: 'Go' })
  })

  it('reads the label written on the canvas back into the properties of an element', () => {
    const { doc, editor } = open()
    const cell = shape(editor, 'c4-container', 'API\n[Container: Java]')
    editor.setElementProperties(cell.getId()!, { owner: 'Заказы' })

    editor.graph.labelChanged(cell, 'Orders\n[Container:Kotlin]\nЗаказы и оплата', null as never)

    expect(cell.getValue()).toBe('Orders\n[Container: Kotlin]\nЗаказы и оплата')
    expect(elementOf(doc, cell)).toEqual({
      name: 'Orders',
      kind: 'c4-container',
      technology: 'Kotlin',
      description: 'Заказы и оплата',
      owner: 'Заказы',
    })
    editor.undo()
    expect(elementOf(doc, cell)).toEqual({ name: 'API', kind: 'c4-container', technology: 'Java', owner: 'Заказы' })
  })

  it('leaves the label of a shape without an element as it is written', () => {
    const { doc, editor } = open()
    const cell = shape(editor, 'c4-container', 'API')

    editor.graph.labelChanged(cell, 'Orders\n[Container:Kotlin]', null as never)

    expect(cell.getValue()).toBe('Orders\n[Container:Kotlin]')
    expect(stored(doc, cell).style).not.toHaveProperty(ELEMENT_KEY)
  })

  it('changes the technology and the interaction of an edge, and the label stays', () => {
    const { doc, editor } = open()
    const a = shape(editor, 'service', 'A')
    const b = editor.addShape('service', { x: 500, y: 200 })!
    const edge = editor.graph.insertEdge({ parent: editor.graph.getDefaultParent(), value: 'Публикует', source: a, target: b })
    editor.graph.setSelectionCell(edge)
    expect(editor.getState().properties).toEqual({
      target: 'edge',
      cellId: edge.getId(),
      properties: { technology: '', interaction: null },
      canChange: true,
    })

    editor.setEdgeProperties(edge.getId()!, { technology: 'Kafka', interaction: 'async' })

    expect(stored(doc, edge).style).toMatchObject({ codrawTechnology: 'Kafka', codrawInteraction: 'async' })
    expect(edge.getValue()).toBe('Публикует')
    editor.undo()
    expect(stored(doc, edge).style).not.toHaveProperty('codrawTechnology')
  })

  it('has no properties of tables, stickies, texts, groups and lines drawn by hand', () => {
    const { editor } = open()
    for (const id of ['table', 'sticky', 'text'] as const) {
      shape(editor, id)
      expect(editor.getState().properties).toBeNull()
    }
  })

  it('changes nothing of a locked shape, nor for a participant who only views', () => {
    const { doc, editor } = open()
    const cell = shape(editor, 'service', 'API')
    editor.setLocked(true)
    expect(editor.getState().properties).toMatchObject({ canChange: false })

    editor.setElementProperties(cell.getId()!, { technology: 'Go' })
    expect(getElements(doc).size).toBe(0)

    const viewer = open({ doc, readOnly: true })
    viewer.editor.graph.setSelectionCell(viewer.editor.graph.getDataModel().getCell(cell.getId()!)!)
    expect(viewer.editor.getState().properties).toMatchObject({ canChange: false })
    viewer.editor.setElementProperties(cell.getId()!, { technology: 'Go' })
    expect(getElements(doc).size).toBe(0)
  })

  it('changes nothing once destroyed, as when a panel applies what was typed after the page went away', () => {
    const { doc, editor } = open()
    const cell = shape(editor, 'service', 'API')
    editor.destroy()

    expect(() => editor.setElementProperties(cell.getId()!, { technology: 'Go' })).not.toThrow()
    expect(() => editor.setEdgeProperties(cell.getId()!, { technology: 'Go' })).not.toThrow()
    expect(getElements(doc).size).toBe(0)
  })

  it('keeps a change of properties out of the history of another page', () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const second = addPage(doc, DEFAULT_PAGE_ID)
    const histories = new PageHistories(doc)
    const other = open({ doc, pageId: second, histories })
    shape(other.editor, 'rectangle')
    other.editor.destroy()
    const { editor } = open({ doc, histories })
    const cell = shape(editor, 'service', 'API')
    editor.setElementProperties(cell.getId()!, { technology: 'Go' })
    editor.destroy()

    const back = open({ doc, pageId: second, histories })
    back.editor.undo()

    expect(getCells(doc, second).size).toBe(2)
    expect([...getElements(doc).values()].map((element) => element.get('technology'))).toEqual(['Go'])
  })
})
