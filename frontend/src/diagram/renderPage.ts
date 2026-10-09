import * as Y from 'yjs'
import { createDiagramEditor, type DiagramEditor } from './editor.ts'
import type { PageLayerView } from './layerViews.ts'
import type { PlanView } from './plan.ts'
import type { PageFilter } from './pageFilter.ts'
import { edgesRouted } from './routing/edgeRouter.ts'
import type { ExportedImage, SvgOptions } from './svgExport.ts'

/** How long a page drawn out of sight waits for the routes of its edges, in milliseconds. */
export const ROUTES_WAIT = 3_000

/**
 * A hidden editor of a page, only for reading, laid out out of sight; `close` removes it. Its layers show as the
 * participant chose for themselves with `layerView`, or else as for everybody, and the plan in its `view`.
 */
function openHiddenEditor(
  document: Y.Doc,
  pageId: string,
  layerView: PageLayerView | null = null,
  view: PlanView = 'diff',
): { editor: DiagramEditor; close: () => void } {
  const page = window.document
  const container = page.createElement('div')
  // Labels are measured, so the canvas is laid out, but out of sight.
  container.style.cssText = 'position:absolute;left:-100000px;top:0;width:800px;height:600px;overflow:hidden;visibility:hidden'
  container.setAttribute('aria-hidden', 'true')
  page.body.append(container)
  const editor = createDiagramEditor(container, document, { pageId, readOnly: true, layerView })
  editor.setPlanView(view)
  return {
    editor,
    close: () => {
      editor.destroy()
      container.remove()
    },
  }
}

/**
 * Draws a page of the board into an SVG image at 100%, as the export does, without showing it: a hidden editor of the
 * page, only for reading, draws it at once and goes, with the layers visible for everybody, as the live image has them.
 * `null` for a page without shapes.
 */
export function renderPageSvg(document: Y.Doc, pageId: string): string | null {
  const { editor, close } = openHiddenEditor(document, pageId)
  try {
    return editor.exportSvg()?.svg ?? null
  } finally {
    close()
  }
}

/**
 * Draws any page of the board into an image at 100%, as the editor of the page would, without showing it, in the view
 * of the plan `view` (see `plan.ts`). Its edges go around the shapes as on the canvas: the hidden editor waits for their
 * routes, but not longer than {@link ROUTES_WAIT}. With a `filter`, only what matches it (see `pageFilter.ts`); with
 * `layerView`, the layers show as the participant chose for themselves. `null` for a page without shapes.
 */
export async function renderPage(
  document: Y.Doc,
  pageId: string,
  { filter = null, ...options }: SvgOptions & { filter?: PageFilter | null } = {},
  layerView: PageLayerView | null = null,
  view: PlanView = 'diff',
): Promise<ExportedImage | null> {
  const { editor, close } = openHiddenEditor(document, pageId, layerView, view)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    if (filter) editor.setFilter({ ...filter, hide: true })
    await Promise.race([edgesRouted(editor.graph), new Promise<void>((resolve) => (timer = setTimeout(resolve, ROUTES_WAIT)))])
    return editor.exportSvg({ ...options, onlyVisible: filter !== null })
  } finally {
    clearTimeout(timer)
    close()
  }
}
