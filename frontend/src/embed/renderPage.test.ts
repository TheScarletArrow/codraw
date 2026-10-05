import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { addPage } from '../diagram/pages.ts'
import { createDiagramEditor } from '../diagram/editor.ts'
import { DEFAULT_PAGE_ID, initializeDocument } from '../diagram/model.ts'
import { renderPageSvg } from './renderPage.ts'

describe('drawing a page out of sight', () => {
  it('draws the shapes of any page of the board without leaving anything on the page', () => {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const second = addPage(doc, DEFAULT_PAGE_ID, 'Данные')
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { pageId: second })
    const shape = editor.addShape('rectangle', { x: 100, y: 100 })!
    editor.graph.getDataModel().setValue(shape, 'Платежи')
    editor.destroy()
    container.remove()
    const before = document.body.childElementCount

    const svg = renderPageSvg(doc, second)

    expect(svg).toContain('<svg')
    expect(svg).toContain('Платежи')
    expect(document.body.childElementCount).toBe(before)
    expect(renderPageSvg(doc, DEFAULT_PAGE_ID)).toBeNull()
  })
})
