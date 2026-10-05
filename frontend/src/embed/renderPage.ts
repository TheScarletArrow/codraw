import * as Y from 'yjs'
import { createDiagramEditor } from '../diagram/editor.ts'

/**
 * Draws a page of the board into an SVG image at 100%, as the export does, without showing it: a hidden editor of the
 * page, only for reading, draws it and goes. `null` for a page without shapes.
 */
export function renderPageSvg(document: Y.Doc, pageId: string): string | null {
  const page = window.document
  const container = page.createElement('div')
  // Labels are measured, so the canvas is laid out, but out of sight.
  container.style.cssText = 'position:absolute;left:-100000px;top:0;width:800px;height:600px;overflow:hidden;visibility:hidden'
  container.setAttribute('aria-hidden', 'true')
  page.body.append(container)
  const editor = createDiagramEditor(container, document, { pageId, readOnly: true })
  try {
    return editor.exportSvg()?.svg ?? null
  } finally {
    editor.destroy()
    container.remove()
  }
}
