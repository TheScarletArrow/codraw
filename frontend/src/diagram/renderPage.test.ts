import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { DiagramBuilder } from '../templates/builder.ts'
import { createDiagramEditor } from './editor.ts'
import { DEFAULT_PAGE_ID, initializeDocument } from './model.ts'
import { addPage } from './pages.ts'
import { renderPage, renderPageSvg, ROUTES_WAIT } from './renderPage.ts'
import type { RoutingRequest } from './routing/edgeRouter.ts'

describe('drawing a page out of sight', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  /** A board whose second page has two shapes, a above and left of b, and an edge between them. */
  function board() {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const second = addPage(doc, DEFAULT_PAGE_ID, 'Данные')
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, { pageId: second })
    const builder = new DiagramBuilder()
    const a = builder.shape('rectangle', 0, 0, { value: 'Платежи', width: 100, height: 60 })
    const b = builder.shape('rectangle', 300, 200, { value: 'Счета', width: 100, height: 60 })
    builder.edge(a, b)
    editor.insertCells(builder.build())
    editor.destroy()
    container.remove()
    return { doc, second }
  }

  /** Workers of the router that answer each request with a route of every edge through x = 200 after `delay`. */
  function routeThrough200(delay: number | null) {
    vi.stubGlobal(
      'Worker',
      class {
        onmessage: ((event: MessageEvent) => void) | null = null
        postMessage({ id, input }: RoutingRequest) {
          if (delay === null) return
          const route = [
            { x: 100, y: 30 },
            { x: 200, y: 30 },
            { x: 200, y: 230 },
            { x: 300, y: 230 },
          ]
          const routes = Object.fromEntries(input.connectors.map((connector) => [connector.id, route]))
          setTimeout(() => this.onmessage?.({ data: { id, routes } } as MessageEvent), delay)
        }
        terminate() {}
      },
    )
  }

  it('draws the shapes of any page of the board without leaving anything on the page', () => {
    const { doc, second } = board()
    const before = document.body.childElementCount

    const svg = renderPageSvg(doc, second)

    expect(svg).toContain('<svg')
    expect(svg).toContain('Платежи')
    expect(document.body.childElementCount).toBe(before)
    expect(renderPageSvg(doc, DEFAULT_PAGE_ID)).toBeNull()
  })

  it('draws any page as an image with the options of the export', async () => {
    const { doc, second } = board()
    const before = document.body.childElementCount

    const image = (await renderPage(doc, second, { transparent: true }))!

    expect(image.svg).toContain('Платежи')
    expect(image.svg).toContain('Счета')
    // No background: the drawing begins at once.
    expect(image.svg).toMatch(/<svg[^>]*><g>/)
    expect(image.cellIds).toBeNull()
    expect(image.width).toBeGreaterThanOrEqual(400)
    expect(document.body.childElementCount).toBe(before)
    expect(await renderPage(doc, DEFAULT_PAGE_ID)).toBeNull()
  })

  it('draws the edges along their routes, as the canvas does', async () => {
    const { doc, second } = board()
    routeThrough200(30)

    const image = (await renderPage(doc, second))!

    // The margin of the image moves the route by 10, lines are drawn on half pixels.
    expect(image.svg).toContain('L 210.5 40.5 L 210.5 240.5')
  })

  it('does not wait for the routes for ever', async () => {
    const { doc, second } = board()
    routeThrough200(null)
    vi.useFakeTimers()

    const image = renderPage(doc, second)
    await vi.advanceTimersByTimeAsync(ROUTES_WAIT)

    expect((await image)!.svg).not.toContain('L 210.5 40.5 L 210.5 240.5')
  })
})
