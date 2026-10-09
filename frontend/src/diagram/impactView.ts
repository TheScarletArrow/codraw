import { InternalEvent, type Cell, type Graph } from '@maxgraph/core'
import {
  dependencyArea,
  dependencyLinks,
  impactNode,
  shortestPaths,
  type ImpactDepth,
  type ImpactRecord,
} from './impact.ts'

/**
 * Impact analysis on the canvas (see `impact.ts`): the element analysed, what it depends on, what depends on it, or the
 * shortest paths between two elements are outlined in their colors, the edges between them drawn in the same colors,
 * and everything else pale — a hook of the style of this editor alone, which reaches no document, the other participants
 * and no image. After every change of the page the analysis is worked out anew; once its element is gone, it ends.
 */

/** What a cell is to the analysis. */
export type ImpactRole = 'focus' | 'dependency' | 'dependent' | 'path'

/** The colors of the roles: violet for the element analysed, blue for its dependencies, orange for its dependents, green for a path. */
export const IMPACT_COLORS: Readonly<Record<ImpactRole, string>> = {
  focus: '#7c3aed',
  dependency: '#2563eb',
  dependent: '#ea580c',
  path: '#16a34a',
}

/** How much of its opacity a cell that the analysis does not touch keeps. */
const PALE = 0.25

export type ImpactRequest =
  | { mode: 'dependencies'; cellId: string; depth: ImpactDepth }
  | { mode: 'path'; from: string; to: string }

/** What the analysis shows: how many dependencies and dependents, or how many steps the paths take (`null` for none). */
export type ImpactState =
  | { mode: 'dependencies'; cellId: string; depth: ImpactDepth; dependencies: number; dependents: number }
  | { mode: 'path'; from: string; to: string; steps: number | null; directed: boolean }

/** The cells of the model in drawing order as the analysis reads them. */
export function modelImpactRecords(graph: Graph): ImpactRecord[] {
  const records: ImpactRecord[] = []
  const visit = (cell: Cell) => {
    for (const child of cell.getChildren()) {
      const id = child.getId()
      if (id && (child.isVertex() || child.isEdge())) {
        records.push({
          id,
          kind: child.isEdge() ? 'edge' : 'vertex',
          parent: child.getParent()?.getId() ?? null,
          source: child.getTerminal(true)?.getId() ?? null,
          target: child.getTerminal(false)?.getId() ?? null,
          value: String(child.getValue() ?? ''),
          style: child.getStyle() as Record<string, unknown>,
        })
      }
      visit(child)
    }
  }
  const root = graph.getDataModel().getRoot()
  if (root) visit(root)
  return records
}

/** The roles of the cells of the page for a request, and what the analysis shows; `null` when it shows nothing. */
function analyse(records: ImpactRecord[], request: ImpactRequest): { roles: Map<string, ImpactRole>; state: ImpactState } | null {
  const roles = new Map<string, ImpactRole>()
  if (request.mode === 'dependencies') {
    const start = impactNode(records, request.cellId)
    if (start === null) return null
    const area = dependencyArea(dependencyLinks(records), start, request.depth)
    area.dependentEdges.forEach((edge) => roles.set(edge, 'dependent'))
    area.dependencyEdges.forEach((edge) => roles.set(edge, 'dependency'))
    area.dependents.forEach((_, node) => roles.set(node, 'dependent'))
    // A node of a cycle is a dependency first.
    area.dependencies.forEach((_, node) => roles.set(node, 'dependency'))
    roles.set(start, 'focus')
    return {
      roles,
      state: { ...request, dependencies: area.dependencies.size, dependents: area.dependents.size },
    }
  }
  const ids = new Set(records.map((record) => record.id))
  if (!ids.has(request.from) || !ids.has(request.to)) return null
  const path = shortestPaths(records, request.from, request.to)
  path?.edges.forEach((edge) => roles.set(edge, 'path'))
  path?.nodes.forEach((node) => roles.set(node, 'path'))
  for (const end of [request.from, request.to]) {
    const node = impactNode(records, end)
    if (node !== null) roles.set(node, 'focus')
  }
  return { roles, state: { ...request, steps: path?.steps ?? null, directed: path?.directed ?? true } }
}

export interface ImpactView {
  state(): ImpactState | null
  set(request: ImpactRequest | null): void
  /** What the analysis makes of the cell: its role, or `pale`, or `null` while it shows nothing. */
  roleOf(cell: Cell): ImpactRole | 'pale' | null
  /** Runs `run` with the page drawn without the analysis, and draws it back, in the same task, which nobody sees. */
  drawn<T>(run: () => T): T
  destroy(): void
}

/**
 * Impact analysis on the canvas of `graph`. Call before the hook of the theme, so that the theme sees the colors.
 * `onChange` hears when the analysis changed or ended.
 */
export function configureImpact(graph: Graph, onChange: () => void): ImpactView {
  let request: ImpactRequest | null = null
  let state: ImpactState | null = null
  let roles = new Map<string, ImpactRole>()
  let suspended = false

  /** The role of a cell, or of what holds it: a field of a table, a label of an edge. */
  const roleOf = (cell: Cell): ImpactRole | 'pale' | null => {
    if (!state || suspended) return null
    let current: Cell | null = cell
    while (current) {
      const role = roles.get(current.getId() ?? '')
      if (role) return current === cell ? role : 'focus'
      current = current.getParent()
    }
    return 'pale'
  }

  const getCellStyle = graph.getCellStyle.bind(graph)
  graph.getCellStyle = (cell) => {
    const style = getCellStyle(cell)
    const role = cell ? roleOf(cell) : null
    if (role === null) return style
    if (role === 'pale') {
      return { ...style, opacity: (style.opacity ?? 100) * PALE, textOpacity: (style.textOpacity ?? 100) * PALE }
    }
    // A field of a table or a label of an edge keeps its own look; the cell of the role gets its color.
    if (!roles.has(cell.getId() ?? '')) return style
    return { ...style, strokeColor: IMPACT_COLORS[role], strokeWidth: Math.max(Number(style.strokeWidth ?? 1), 2.5) }
  }

  /** Draws again the cells of the page that `changed` names: those whose look the analysis changes. */
  const redraw = (changed: (id: string) => boolean) => {
    const view = graph.getView()
    const touched: Cell[] = []
    const visit = (cell: Cell) => {
      for (const child of cell.getChildren()) {
        if (changed(child.getId() ?? '')) touched.push(child)
        visit(child)
      }
    }
    const root = graph.getDataModel().getRoot()
    if (root) visit(root)
    for (const cell of touched) {
      const cellState = view.getState(cell)
      if (cellState) cellState.invalidStyle = true
      view.invalidate(cell, true, true)
    }
    if (touched.length > 0) view.validate()
  }

  const apply = (next: ImpactRequest | null) => {
    const before = roles
    const wasActive = state !== null
    const result = next ? analyse(modelImpactRecords(graph), next) : null
    request = result ? next : null
    state = result?.state ?? null
    roles = result?.roles ?? new Map()
    // Turning the analysis on or off changes every cell: the others go pale or come back.
    redraw(wasActive !== (state !== null) ? () => true : (id) => before.get(id) !== roles.get(id))
  }

  // Changes of the page — own, of others, undone — change what depends on what; a removed element ends the analysis.
  const handleChange = () => {
    if (!request || suspended) return
    const before = JSON.stringify(state)
    apply(request)
    if (JSON.stringify(state) !== before) onChange()
  }
  graph.getDataModel().addListener(InternalEvent.CHANGE, handleChange)

  return {
    state: () => state,
    set(next) {
      apply(next)
      onChange()
    },
    roleOf,
    drawn(run) {
      if (!state) return run()
      suspended = true
      redraw(() => true)
      try {
        return run()
      } finally {
        suspended = false
        redraw(() => true)
      }
    },
    destroy() {
      graph.getDataModel().removeListener(handleChange)
    },
  }
}
