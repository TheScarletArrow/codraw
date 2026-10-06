import type { Cell } from '@maxgraph/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { DiagramBuilder } from '../../templates/builder.ts'
import { createDiagramEditor, type DiagramEditor } from '../editor.ts'
import { initializeDocument } from '../model.ts'
import { edgesRouted, startEdgeRouting, type RoutingRequest, type RoutingWorker } from './edgeRouter.ts'
import type { Routes } from './routeEdges.ts'

describe('routing of edges in the editor', () => {
  const stops: (() => void)[] = []
  const editors: DiagramEditor[] = []
  afterEach(() => {
    stops.splice(0).forEach((stop) => stop())
    editors.splice(0).forEach((editor) => editor.destroy())
  })

  /** Two shapes and an edge between them, routed by a worker that the test answers. */
  async function open() {
    const doc = new Y.Doc()
    initializeDocument(doc)
    const container = document.createElement('div')
    document.body.append(container)
    const editor = createDiagramEditor(container, doc, {})
    editors.push(editor)
    const builder = new DiagramBuilder()
    const a = builder.shape('rectangle', 0, 0, { value: 'a', width: 100, height: 60 })
    const b = builder.shape('rectangle', 300, 200, { value: 'b', width: 100, height: 60 })
    builder.edge(a, b, { value: 'ab' })
    editor.insertCells(builder.build())
    const postMessage = vi.fn<(request: RoutingRequest) => void>()
    const worker: RoutingWorker = { postMessage, terminate: vi.fn(), onmessage: null }
    stops.push(startEdgeRouting(editor.graph, worker))
    const cell = (value: string) => editor.graph.getDefaultParent().getChildren().find((child) => child.getValue() === value)!
    const requests = () => postMessage.mock.calls.map(([request]) => request)
    const answer = (request: RoutingRequest, routes: Routes) => worker.onmessage!({ data: { id: request.id, routes } } as MessageEvent)
    await vi.waitFor(() => expect(requests()).toHaveLength(1))
    return { editor, worker, cell, requests, answer, stop: stops.at(-1)! }
  }

  /** Whether a promise has resolved by the time the tasks queued before have run. */
  const resolved = async (promise: Promise<void>) => {
    let done = false
    void promise.then(() => (done = true))
    await new Promise((resolve) => setTimeout(resolve, 0))
    return done
  }

  /** The drawn points of an edge in coordinates of the page. */
  const drawn = (editor: DiagramEditor, edge: Cell) => {
    const { scale, translate } = editor.graph.getView()
    return editor.graph
      .getView()
      .getState(edge)!
      .absolutePoints.map((point) => ({ x: point!.x / scale - translate.x, y: point!.y / scale - translate.y }))
  }
  const ROUTE = [
    { x: 100, y: 30 },
    { x: 200, y: 30 },
    { x: 200, y: 230 },
    { x: 300, y: 230 },
  ]

  it('draws an edge along its route, from pin to pin', async () => {
    const { editor, cell, requests, answer } = await open()
    expect(requests()[0]!.input.connectors.map((connector) => connector.id)).toEqual([cell('ab').getId()])

    answer(requests()[0]!, { [cell('ab').getId()!]: ROUTE })

    expect(drawn(editor, cell('ab'))).toEqual(ROUTE)
  })

  it('routes again after a shape moves and meanwhile draws the edge as maxGraph routes it', async () => {
    const { editor, cell, requests, answer } = await open()
    answer(requests()[0]!, { [cell('ab').getId()!]: ROUTE })

    editor.graph.setSelectionCell(cell('b'))
    editor.moveSelection(0, 40)

    expect(drawn(editor, cell('ab'))).not.toEqual(ROUTE)
    expect(drawn(editor, cell('ab')).at(-1)!.y).toBeGreaterThan(200)
    await vi.waitFor(() => expect(requests()).toHaveLength(2))
    expect(requests()[1]!.input.shapes.find((shape) => shape.id === cell('b').getId())!.y).toBe(240)
  })

  it('draws an edge with bends of the participant through them', async () => {
    const { editor, cell, requests, answer } = await open()
    answer(requests()[0]!, { [cell('ab').getId()!]: ROUTE })
    const geometry = cell('ab').getGeometry()!.clone()
    geometry.points = [{ x: 350, y: 30 } as never]

    editor.graph.getDataModel().setGeometry(cell('ab'), geometry)

    expect(drawn(editor, cell('ab'))).not.toEqual(ROUTE)
  })

  it('sends one request at a time, then the newest input, and ignores answers to other requests', async () => {
    const { editor, cell, requests, answer } = await open()
    editor.graph.setSelectionCell(cell('b'))
    editor.moveSelection(10, 0)
    await new Promise((resolve) => setTimeout(resolve, 50))
    editor.moveSelection(10, 0)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(requests()).toHaveLength(1)

    answer({ id: 99, input: requests()[0]!.input }, { [cell('ab').getId()!]: ROUTE })
    expect(drawn(editor, cell('ab'))).not.toEqual(ROUTE)
    answer(requests()[0]!, {})

    expect(requests()).toHaveLength(2)
    expect(requests()[1]!.input.shapes.find((shape) => shape.id === cell('b').getId())!.x).toBe(320)
  })

  it('tells when the edges are routed for the model as it is now', async () => {
    const { editor, cell, requests, answer } = await open()
    const first = edgesRouted(editor.graph)
    expect(await resolved(first)).toBe(false)

    answer(requests()[0]!, { [cell('ab').getId()!]: ROUTE })

    expect(await resolved(first)).toBe(true)
    expect(drawn(editor, cell('ab'))).toEqual(ROUTE)
    expect(await resolved(edgesRouted(editor.graph))).toBe(true)

    editor.graph.setSelectionCell(cell('b'))
    editor.moveSelection(0, 40)
    const second = edgesRouted(editor.graph)
    await vi.waitFor(() => expect(requests()).toHaveLength(2))
    expect(await resolved(second)).toBe(false)
    answer(requests()[1]!, {})
    expect(await resolved(second)).toBe(true)
  })

  it('does not keep waiting for the routes when routing stops or there is no router', async () => {
    const { editor, stop } = await open()
    const routes = edgesRouted(editor.graph)

    stop()

    expect(await resolved(routes)).toBe(true)
    expect(await resolved(edgesRouted(editor.graph))).toBe(true)
  })

  it('stops routing when the router fails to load', async () => {
    const { worker, requests } = await open()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    worker.onmessage!({ data: { id: requests()[0]!.id, error: 'CompileError' } } as MessageEvent)

    expect(worker.terminate).toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
