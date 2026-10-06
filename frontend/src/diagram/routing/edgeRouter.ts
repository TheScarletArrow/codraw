import { EdgeStyleRegistry, InternalEvent, Point, type AbstractGraph, type CellState, type EdgeStyleFunction } from '@maxgraph/core'
import type { RoutePoint, Routes } from './routeEdges.ts'
import { routingInput, type RoutingBox, type RoutingInput } from './routingInput.ts'

export interface RoutingRequest {
  id: number
  input: RoutingInput
}

export type RoutingResponse = { id: number; routes: Routes } | { id: number; error: string }

/** The part of a worker the router uses, so that tests can stand in for it. */
export type RoutingWorker = Pick<Worker, 'postMessage' | 'terminate'> & {
  onmessage: ((event: MessageEvent<RoutingResponse>) => void) | null
}

/** A route with what it was made for: the cells at the ends of the edge and the shapes they are on, where they were. */
interface Route {
  points: RoutePoint[]
  source: string
  target: string
  sourceShape: { id: string; box: RoutingBox }
  targetShape: { id: string; box: RoutingBox }
}

/** The route of the edge of a state for where its ends are now; `null` when there is none or it is out of date. */
type RouteOf = (state: CellState) => Route | null

const routers = new WeakMap<AbstractGraph, RouteOf>()

/** Promises of the routes of the graphs that are routed, see {@link edgesRouted}. */
const routedPromises = new WeakMap<AbstractGraph, () => Promise<void>>()

/**
 * Resolves once the edges of the graph have their routes for the model as it is now, e.g. before a page drawn out of
 * sight is saved; at once when nothing routes them: no workers, or the router stopped or failed to load.
 */
export function edgesRouted(graph: AbstractGraph): Promise<void> {
  return routedPromises.get(graph)?.() ?? Promise.resolve()
}

function startWorker(): RoutingWorker | null {
  if (typeof Worker === 'undefined') return null
  return new Worker(new URL('./routing.worker.ts', import.meta.url), { type: 'module' })
}

const nextFrame = (callback: () => void) =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : setTimeout(callback, 0)

/**
 * Routes the edges of the page of the graph around its shapes in a worker whenever the model changes, one request at
 * a time, and redraws the edges whose routes changed. Without workers, or when the router fails to load, edges keep
 * the orthogonal routing of maxGraph. Returns a function that stops it.
 */
export function startEdgeRouting(graph: AbstractGraph, worker: RoutingWorker | null = startWorker()): () => void {
  if (!worker) return () => {}
  registerRoutedEdgeStyle()
  const model = graph.getDataModel()
  const view = graph.getView()
  let routes = new Map<string, Route>()
  let sent = ''
  let scheduled = false
  let stopped = false
  let requests = 0
  /** The request the worker is routing, and the newest input that waits for it. */
  let routing: RoutingRequest | null = null
  let waiting: RoutingInput | null = null
  /** Who waits for the routes of the model as it is now. */
  const routedWaiters: (() => void)[] = []
  const isRouted = () => stopped || (!scheduled && routing === null)
  const settle = () => {
    if (isRouted()) routedWaiters.splice(0).forEach((resolve) => resolve())
  }

  const send = (input: RoutingInput) => {
    routing = { id: ++requests, input }
    worker.postMessage(routing)
  }
  const update = () => {
    scheduled = false
    if (stopped) return
    const input = routingInput(graph.getDefaultParent())
    const key = JSON.stringify(input)
    if (key !== sent) {
      sent = key
      if (routing) waiting = input
      else send(input)
    }
    settle()
  }
  const schedule = () => {
    if (scheduled || stopped) return
    scheduled = true
    nextFrame(update)
  }
  const apply = (input: RoutingInput, routed: Routes) => {
    const shapes = new Map(input.shapes.map(({ id, ...box }) => [id, { id, box }]))
    const next = new Map<string, Route>()
    for (const { id, source, target } of input.connectors) {
      const points = routed[id]
      if (!points || points.length < 2) continue
      next.set(id, {
        points,
        source: source.cell,
        target: target.cell,
        sourceShape: shapes.get(source.shape)!,
        targetShape: shapes.get(target.shape)!,
      })
    }
    const changed = [...new Set([...routes.keys(), ...next.keys()])].filter(
      (id) => JSON.stringify(routes.get(id)) !== JSON.stringify(next.get(id)),
    )
    routes = next
    for (const id of changed) {
      const edge = model.getCell(id)
      if (edge) view.invalidate(edge, false, false)
    }
    if (changed.length > 0) view.validate()
  }
  worker.onmessage = ({ data }) => {
    if (stopped || data.id !== routing?.id) return
    if ('error' in data) {
      // The router did not load, e.g. WebAssembly is not allowed: edges stay as maxGraph routes them.
      console.warn('Edge routing is off:', data.error)
      stop()
      return
    }
    const done = routing
    routing = null
    apply(done.input, data.routes)
    if (waiting) {
      const input = waiting
      waiting = null
      send(input)
    }
    settle()
  }

  /** Where a shape is drawn, in coordinates of the page. */
  const drawnBox = (id: string): RoutingBox | null => {
    const cell = model.getCell(id)
    const state = cell && view.getState(cell)
    if (!state) return null
    const { scale, translate } = view
    return { x: state.x / scale - translate.x, y: state.y / scale - translate.y, width: state.width / scale, height: state.height / scale }
  }
  const at = (id: string, box: RoutingBox) => {
    const drawn = drawnBox(id)
    return (
      drawn !== null &&
      Math.abs(drawn.x - box.x) < 0.5 &&
      Math.abs(drawn.y - box.y) < 0.5 &&
      Math.abs(drawn.width - box.width) < 0.5 &&
      Math.abs(drawn.height - box.height) < 0.5
    )
  }
  routers.set(graph, (state) => {
    const route = routes.get(state.cell.getId()!)
    if (!route) return null
    const edge = state.cell
    if (edge.getTerminal(true)?.getId() !== route.source || edge.getTerminal(false)?.getId() !== route.target) return null
    return at(route.sourceShape.id, route.sourceShape.box) && at(route.targetShape.id, route.targetShape.box) ? route : null
  })
  routedPromises.set(graph, () => (isRouted() ? Promise.resolve() : new Promise((resolve) => routedWaiters.push(resolve))))

  model.addListener(InternalEvent.CHANGE, schedule)
  schedule()
  const stop = () => {
    if (stopped) return
    stopped = true
    model.removeListener(schedule)
    worker.terminate()
    const routed = [...routes.keys()]
    routes = new Map()
    routers.delete(graph)
    routedPromises.delete(graph)
    settle()
    for (const id of routed) {
      const edge = model.getCell(id)
      if (edge) view.invalidate(edge, false, false)
    }
    if (routed.length > 0) view.validate()
  }
  return stop
}

let registered = false

/**
 * Replaces the orthogonal routing of maxGraph, the routing of new edges: an edge with a route goes along it from pin to
 * pin, and maxGraph does not move its ends along the borders of the shapes; other edges, and edges whose shapes have
 * moved since they were routed, are routed by maxGraph. Bends that the participant places take an edge out of the
 * routed ones.
 */
function registerRoutedEdgeStyle() {
  if (registered) return
  registered = true
  const orthogonal = EdgeStyleRegistry.get('orthogonalEdgeStyle')!
  const routed: EdgeStyleFunction = (state, source, target, points, result) => {
    const route = points?.length || state.style.curved ? null : (routers.get(state.view.graph)?.(state) ?? null)
    if (!route) {
      orthogonal(state, source, target, points, result)
      return
    }
    const { scale, translate } = state.view
    const toView = ({ x, y }: RoutePoint) => new Point((x + translate.x) * scale, (y + translate.y) * scale)
    result[0] = toView(route.points[0]!)
    for (const point of route.points.slice(1, -1)) result.push(toView(point))
    // maxGraph takes the end from here and does not move it along the border of the shape any more.
    state.absolutePoints[state.absolutePoints.length - 1] = toView(route.points.at(-1)!)
  }
  EdgeStyleRegistry.add('orthogonalEdgeStyle', routed, { handlerKind: 'segment', isOrthogonal: true })
}
