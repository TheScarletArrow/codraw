import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { PageHistories } from './binding.ts'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { LINK_KEY, pageLink } from './links.ts'
import { DEFAULT_PAGE_ID, getCells, initializeDocument } from './model.ts'
import { listPages } from './pages.ts'

const linkOf = (editor: DiagramEditor, id: string) => (editor.graph.getDataModel().getCell(id)!.getStyle() as Record<string, unknown>)[LINK_KEY]

describe('detail of an element in the editor', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    document.body.replaceChildren()
  })

  function open(doc: Y.Doc, { histories = null as PageHistories | null, readOnly = false, pageId = DEFAULT_PAGE_ID } = {}) {
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

  function board() {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const histories = new PageHistories(doc)
    const editor = open(doc, { histories })
    const system = editor.addShape('c4-system', { x: 300, y: 300 })!
    const person = editor.addShape('c4-person', { x: 300, y: 0 })!
    const graph = editor.graph
    graph.insertEdge({ parent: graph.getDefaultParent(), source: person, target: system, value: 'Заказывает' })
    graph.clearSelection()
    return { doc, editor, system: system.getId()!, person: person.getId()! }
  }

  it('makes the page of detail as one undo step, and opens it after that', () => {
    const { doc, editor, system, person } = board()
    expect(editor.detailOffer(system)).toBe('create')
    expect(editor.detailOffer(person)).toBeNull()

    const page = editor.detailElement(system)!

    expect(listPages(doc).map((item) => item.id)).toEqual([DEFAULT_PAGE_ID, page])
    expect(linkOf(editor, system)).toBe(pageLink(page))
    expect(getCells(doc, page).size).toBe(2 + 3)
    expect(editor.detailOffer(system)).toBe('open')
    expect(editor.detailElement(system)).toBe(page)
    expect(listPages(doc)).toHaveLength(2)
    // The boundary on the page of detail leads up by its link, not down.
    const detail = open(doc, { pageId: page })
    const boundary = detail.graph.getDefaultParent().getChildren().find((cell) => (cell.getStyle() as Record<string, unknown>).codrawShape === 'c4-boundary')!
    expect(detail.detailOffer(boundary.getId()!)).toBeNull()

    editor.undo()
    expect(listPages(doc).map((item) => item.id)).toEqual([DEFAULT_PAGE_ID])
    expect(linkOf(editor, system)).toBeUndefined()
    expect(editor.detailOffer(system)).toBe('create')
  })

  it('lets a viewer open a page of detail, and makes none for a viewer or of a locked shape', () => {
    const { doc, editor, system } = board()
    const viewer = open(doc, { readOnly: true })
    expect(viewer.detailOffer(system)).toBeNull()
    expect(viewer.detailElement(system)).toBeNull()

    editor.graph.setSelectionCell(editor.graph.getDataModel().getCell(system)!)
    editor.setLocked(true)
    expect(editor.detailOffer(system)).toBeNull()
    editor.setLocked(false)
    const page = editor.detailElement(system)

    expect(viewer.detailOffer(system)).toBe('open')
    expect(viewer.detailElement(system)).toBe(page)
  })
})
