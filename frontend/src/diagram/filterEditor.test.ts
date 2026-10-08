import type { Cell, CellStyle } from '@maxgraph/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import { getCells, initializeDocument, readCell } from './model.ts'
import { NO_FILTER, type PageFilter } from './pageFilter.ts'
import { renderPage } from './renderPage.ts'
import { connect } from './testing.ts'

describe('the filter of a page in the editor', () => {
  const editors: DiagramEditor[] = []
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy())
    document.body.replaceChildren()
  })

  function open({ doc = new Y.Doc(), readOnly = false } = {}) {
    if (!readOnly) initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { readOnly, participantName: 'Алиса', participantId: 'alice' })
    editors.push(editor)
    return { doc, editor }
  }

  const filter = (changes: Partial<PageFilter>): PageFilter => ({ ...NO_FILTER, ...changes })
  const cellOf = (editor: DiagramEditor, value: string) =>
    editor.graph
      .getDefaultParent()
      .getChildren()
      .find((cell) => String(cell.getValue()).split('\n')[0] === value)!
  const opacity = (editor: DiagramEditor, cell: Cell) => editor.graph.getCellStyle(cell).opacity ?? 100

  /** Payments and Ledger of the payments team, Stock of the warehouse, an edge from Payments to each, and a sticky. */
  function payments(editor: DiagramEditor) {
    const pay = editor.addShape('service', { x: 0, y: 0 })!
    const ledger = editor.addShape('database', { x: 200, y: 0 })!
    const stock = editor.addShape('database', { x: 400, y: 0 })!
    editor.setElementProperties(pay.getId()!, { name: 'Payments', owner: 'Платежи', tags: ['pci'] })
    editor.setElementProperties(ledger.getId()!, { name: 'Ledger', owner: 'Платежи' })
    editor.setElementProperties(stock.getId()!, { name: 'Stock', owner: 'Склад' })
    const graph = editor.graph
    const toLedger = graph.insertEdge({ parent: graph.getDefaultParent(), source: pay, target: ledger, style: { codrawInteraction: 'sync' } as CellStyle })
    const toStock = graph.insertEdge({ parent: graph.getDefaultParent(), source: pay, target: stock, style: { codrawInteraction: 'async' } as CellStyle })
    const note = editor.addSticky({ x: 0, y: 300 })!
    return { pay, ledger, stock, toLedger, toStock, note }
  }

  it('draws what does not match pale, keeps it selectable, and changes nothing of the document', () => {
    const { doc, editor } = open()
    const { pay, stock, toLedger, toStock, note } = payments(editor)
    const before = Y.encodeStateAsUpdate(doc)

    editor.setFilter(filter({ owners: ['Платежи'] }))

    expect(editor.getState().filter).toEqual({ matched: 2, total: 3, hide: false })
    expect(opacity(editor, stock)).toBe(25)
    expect(opacity(editor, toStock)).toBe(25)
    expect(opacity(editor, pay)).toBe(100)
    expect(opacity(editor, toLedger)).toBe(100)
    expect(opacity(editor, note)).toBe(100)
    expect(editor.filterStatus(stock.getId()!)).toBe('dimmed')
    expect(editor.filterStatus(pay.getId()!)).toBeNull()
    expect(editor.revealCell(stock.getId()!)).toBe(true)
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before)
    expect(readCell(stock.getId()!, getCells(doc).get(stock.getId()!)!).style).not.toHaveProperty('opacity')

    editor.setFilter(null)
    expect(opacity(editor, stock)).toBe(100)
    expect(editor.getState().filter).toBeNull()
  })

  it('hides what does not match: not drawn, not selected by «select all», drawn again without the filter', () => {
    const { editor } = open()
    const { pay, ledger, stock, toLedger, toStock, note } = payments(editor)
    editor.graph.setSelectionCell(stock)

    editor.setFilter(filter({ owners: ['Платежи'], hide: true }))

    expect(stock.isVisible()).toBe(false)
    expect(toStock.isVisible()).toBe(false)
    expect(editor.graph.getView().getState(stock)).toBeNull()
    expect(editor.graph.getSelectionCells()).toEqual([])
    editor.graph.selectAll()
    expect(new Set(editor.graph.getSelectionCells())).toEqual(new Set([pay, ledger, toLedger, note]))
    expect(editor.filterStatus(stock.getId()!)).toBe('hidden')
    expect(editor.revealCell(stock.getId()!)).toBe(false)

    editor.setFilter(filter({ owners: ['Платежи'] }))
    expect(stock.isVisible()).toBe(true)
    expect(editor.graph.getView().getState(stock)).not.toBeNull()
    expect(opacity(editor, stock)).toBe(25)
  })

  it('follows the changes of others: a matching tag shows an element, a new one that does not match is hidden', () => {
    const { doc, editor } = open()
    const other = open({ doc: new Y.Doc() })
    connect(doc, other.doc)
    payments(editor)
    editor.setFilter(filter({ tags: ['pci'], hide: true }))
    expect(cellOf(editor, 'Stock').isVisible()).toBe(false)

    other.editor.setElementProperties(cellOf(other.editor, 'Stock').getId()!, { tags: ['pci'] })
    expect(cellOf(editor, 'Stock').isVisible()).toBe(true)
    expect(cellOf(other.editor, 'Ledger').isVisible()).toBe(true)

    const queue = other.editor.addShape('queue', { x: 0, y: 500 })!
    const seen = editor.graph.getDataModel().getCell(queue.getId()!)!
    expect(seen.isVisible()).toBe(false)
    // The other participant sees everything.
    expect(other.editor.graph.getView().getState(queue)).not.toBeNull()
  })

  it('draws an image of the page without the filter, or of what matches only', async () => {
    const { doc, editor } = open()
    payments(editor)
    editor.setFilter(filter({ owners: ['Платежи'] }))

    const whole = editor.exportSvg()!
    expect(whole.svg).toContain('Stock')
    expect(whole.cellIds).toBeNull()
    const visible = editor.exportSvg({ onlyVisible: true })!
    expect(visible.svg).toContain('Payments')
    expect(visible.svg).not.toContain('Stock')
    expect(visible.cellIds).toHaveLength(4)
    // The canvas is drawn as it was.
    expect(opacity(editor, cellOf(editor, 'Stock'))).toBe(25)
    expect(cellOf(editor, 'Stock').isVisible()).toBe(true)

    // Without «only visible», the image is that of the page without the filter.
    editor.setFilter(null)
    expect(editor.exportSvg()!.svg).toBe(whole.svg)

    const other = await renderPage(doc, 'page-1', { filter: filter({ owners: ['Склад'] }) })
    expect(other!.svg).toContain('Stock')
    expect(other!.svg).not.toContain('Ledger')
  })

  it('offers the values of the page and sketches what does not match pale on the minimap', () => {
    const { editor } = open()
    const { stock, toStock } = payments(editor)
    expect(editor.filterChoices().owners.map((choice) => [choice.value, choice.count])).toEqual([
      ['Платежи', 2],
      ['Склад', 1],
    ])
    editor.setFilter(filter({ owners: ['Платежи'], hide: true }))
    const sketch = editor.pageSketch()
    expect(sketch.shapes.find((shape) => shape.id === stock.getId())).toMatchObject({ dimmed: true, x: 400 - 50, width: 100 })
    expect(sketch.shapes.filter((shape) => shape.dimmed)).toHaveLength(1)
    expect(sketch.edges.some((edge) => edge.id === toStock.getId())).toBe(false)
  })

  it('works for a viewer too', () => {
    const { doc, editor } = open()
    payments(editor)
    const viewer = open({ doc, readOnly: true })
    viewer.editor.setFilter(filter({ owners: ['Склад'], hide: true }))
    expect(cellOf(viewer.editor, 'Payments').isVisible()).toBe(false)
    expect(cellOf(editor, 'Payments').isVisible()).toBe(true)
  })
})
