import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { PageHistories } from './binding.ts'
import { cellsXml } from './clipboardFormat.ts'
import { buildModel } from './boardModel.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { DEFAULT_PAGE_ID, ELEMENT_KEY, getCells, getElements, initializeDocument, readCell } from './model.ts'
import { createViewPage, viewOf } from './modelViews.ts'
import { duplicatePage, listPages } from './pages.ts'
import { attachViewKeeper } from './viewKeeper.ts'
import { COMPUTED_KEY, type ViewRule } from './viewRule.ts'

const rule = (changes: Partial<ViewRule>): ViewRule => ({ kind: 'landscape', scope: null, environment: null, owners: [], tags: [], technologies: [], ...changes })

const styleOf = (editor: DiagramEditor, id: string) => editor.graph.getDataModel().getCell(id)!.getStyle() as Record<string, unknown>

describe('views in the editor', () => {
  const editors: DiagramEditor[] = []
  const detachers: (() => void)[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    detachers.splice(0).forEach((detach) => detach())
    document.body.replaceChildren()
  })

  function open(doc: Y.Doc, histories: PageHistories, pageId = DEFAULT_PAGE_ID, readOnly = false) {
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { pageId, readOnly, participantName: 'Алиса', participantId: 'alice', undoManager: histories.get(pageId) })
    editors.push(editor)
    return editor
  }

  /** A board whose first page has two systems and an edge between them, and a landscape of it. */
  function board() {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const histories = new PageHistories(doc)
    const editor = open(doc, histories)
    const shop = editor.addShape('c4-system', { x: 0, y: 0 })!
    const bank = editor.addShape('c4-external-system', { x: 600, y: 0 })!
    const graph = editor.graph
    graph.insertEdge({ parent: graph.getDefaultParent(), source: shop, target: bank, value: 'Платит' })
    graph.clearSelection()
    detachers.push(attachViewKeeper(doc))
    const view = createViewPage(doc, DEFAULT_PAGE_ID, rule({ kind: 'landscape' }), 'Ландшафт')
    return { doc, histories, editor, view, shop: shop.getId()!, bank: bank.getId()! }
  }

  const computedCells = (editor: DiagramEditor) =>
    editor.graph
      .getDefaultParent()
      .getChildren()
      .filter((cell) => typeof (cell.getStyle() as Record<string, unknown>)[COMPUTED_KEY] === 'string')

  it('hides a computed cell removed on the view in the same undo step, and undo shows it again', () => {
    const { doc, histories, view, bank } = board()
    const viewEditor = open(doc, histories, view)
    expect(computedCells(viewEditor)).toHaveLength(3)
    const bankCell = computedCells(viewEditor).find((cell) => (cell.getStyle() as Record<string, unknown>)[ELEMENT_KEY] === bank)!
    viewEditor.graph.removeCells([bankCell], true)
    expect(viewOf(doc, view)!.hidden).toEqual([bank])
    expect(computedCells(viewEditor)).toHaveLength(1)
    viewEditor.undo()
    expect(viewOf(doc, view)!.hidden).toEqual([])
    expect(computedCells(viewEditor)).toHaveLength(3)
  })

  it('does not let the label of a computed edge be edited, and shows the relations it is made of', () => {
    const { doc, histories, view } = board()
    const viewEditor = open(doc, histories, view)
    const edge = computedCells(viewEditor).find((cell) => cell.isEdge())!
    expect(viewEditor.graph.isCellEditable(edge)).toBe(false)
    viewEditor.graph.setSelectionCell(edge)
    const selection = viewEditor.getState().properties
    expect(selection).toMatchObject({ target: 'edge', canChange: false })
    expect(selection?.target === 'edge' && selection.relations).toEqual([
      expect.objectContaining({ pageId: DEFAULT_PAGE_ID, pageName: 'Страница 1', source: 'Система', target: 'Внешняя система', label: 'Платит' }),
    ])
  })

  it('pastes copies of computed cells as drawn ones', () => {
    const { doc, histories, view } = board()
    const viewEditor = open(doc, histories, view)
    const cells = computedCells(viewEditor).filter((cell) => cell.isVertex())
    const clones = viewEditor.graph.cloneCells(cells, false)
    expect(clones.every((clone) => (clone.getStyle() as Record<string, unknown>)[COMPUTED_KEY] === undefined)).toBe(true)
    expect(cellsXml(cells.map((cell) => cell.clone()))).not.toContain(COMPUTED_KEY)
  })

  it('sets what an element is a part of as one undo step, making a shape an element', () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const histories = new PageHistories(doc)
    const editor = open(doc, histories)
    const shop = editor.addShape('c4-system', { x: 0, y: 0 })!.getId()!
    const api = editor.addShape('c4-container', { x: 600, y: 0 })!.getId()!
    // The system is a shape of a kind: the model knows it by its cell, the id of the element it would become.
    editor.setModelField(api, 'parent', shop)
    expect(styleOf(editor, api)[ELEMENT_KEY]).toBe(api)
    expect(buildModel(doc).elements.get(api)!.parent).toBe(shop)
    editor.undo()
    expect(getElements(doc).get(api)?.get('parent')).toBeUndefined()
    expect(buildModel(doc).elements.get(api)!.parent).toBeNull()
  })

  it('changes the rule as one undo step of the view, and makes it a page of its own', () => {
    const { doc, histories, view, shop } = board()
    const viewEditor = open(doc, histories, view)
    viewEditor.setViewRule(rule({ kind: 'context', scope: shop }))
    expect(viewOf(doc, view)!.rule.kind).toBe('context')
    viewEditor.undo()
    expect(viewOf(doc, view)!.rule.kind).toBe('landscape')
    viewEditor.detachView()
    expect(viewOf(doc, view)).toBeNull()
    expect(computedCells(viewEditor)).toEqual([])
  })

  it('duplicates a view as another view of the same elements', () => {
    const { doc, view, shop } = board()
    const copy = duplicatePage(doc, view)!
    expect(viewOf(doc, copy)!.rule).toEqual(viewOf(doc, view)!.rule)
    expect(listPages(doc).find((page) => page.id === copy)!.name).toBe('Ландшафт (копия)')
    const elements = Array.from(getCells(doc, copy).values()).map((cell) => readCell('x', cell).style[ELEMENT_KEY])
    expect(elements).toContain(readCell(shop, getCells(doc).get(shop)!).style[ELEMENT_KEY])
  })
})
