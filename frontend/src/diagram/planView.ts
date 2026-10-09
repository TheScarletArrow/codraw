import { InternalEvent, type Cell, type Graph } from '@maxgraph/core'
import { cellVisibility, type CellVisibility } from './cellVisibility.ts'
import { hiddenIn, PLAN_COLORS, planOf, type Plan, type PlanView } from './plan.ts'

/**
 * The view of the current and the target architecture on the canvas (see `plan.ts`), of this editor alone: in the
 * difference the elements that will appear are outlined in green and those that will go in red and dashed, through a
 * hook of the style; the state now and the target leave out, by hiding them, the elements that will appear or will go,
 * the cells in them and the edges that end at them. A hidden cell is not selected. After every change of the page the
 * view is worked out anew.
 */

/** How many elements of the page will appear and will go. */
export interface PlanCounts {
  added: number
  removed: number
}

export interface PlanViewControl {
  view(): PlanView
  set(view: PlanView): void
  counts(): PlanCounts
  destroy(): void
}

/** The mark of a cell, or of the nearest cell it is in: a field of a table, a shape of a group, a label of an edge. */
function planAt(cell: Cell): Plan | null {
  for (let current: Cell | null = cell; current?.getParent(); current = current.getParent()) {
    const plan = planOf(current.getStyle() as Record<string, unknown>)
    if (plan) return plan
  }
  return null
}

/**
 * The view of the plan on the canvas of `graph`. Call before the hook of the theme, so that the theme sees the colors.
 * `onChange` hears when the view or the counts changed.
 */
export function configurePlan(
  graph: Graph,
  onChange: () => void,
  visibility: CellVisibility = cellVisibility(),
): PlanViewControl {
  let view: PlanView = 'diff'
  let counts: PlanCounts = { added: 0, removed: 0 }
  // The mark each cell is drawn with, to draw again those whose mark changes with that of a cell they are in.
  let drawnAs = new Map<string, Plan>()

  const getCellStyle = graph.getCellStyle.bind(graph)
  graph.getCellStyle = (cell) => {
    const style = getCellStyle(cell)
    const plan = view === 'diff' && cell ? planAt(cell) : null
    // A cell without a line of its own, e.g. a field or a label, keeps its look: the cell it is in shows the mark.
    if (!plan || style.strokeColor === 'none') return style
    return {
      ...style,
      strokeColor: PLAN_COLORS[plan],
      strokeWidth: Math.max(Number(style.strokeWidth ?? 1), 2),
      ...(plan === 'removed' && { dashed: true }),
    }
  }

  /** Shows the page as the view wants it; returns whether anything of it changed. */
  const apply = (): boolean => {
    const root = graph.getDataModel().getRoot()
    if (!root) return false
    const marks = new Map<string, Plan>()
    const hidden = new Set<Cell>()
    const next: PlanCounts = { added: 0, removed: 0 }
    const edges: Cell[] = []
    const visit = (cell: Cell, inherited: Plan | null, inHidden: boolean) => {
      for (const child of cell.getChildren()) {
        const own = planOf(child.getStyle() as Record<string, unknown>)
        if (own && (child.isVertex() || child.isEdge())) next[own]++
        const plan = own ?? inherited
        const id = child.getId()
        if (id && plan) marks.set(id, plan)
        const hides = !inHidden && hiddenIn(view, plan)
        if (hides) hidden.add(child)
        if (child.isEdge()) edges.push(child)
        visit(child, plan, inHidden || hides)
      }
    }
    visit(root, null, false)
    // An edge that ends at a hidden element goes with it.
    const isHidden = (cell: Cell | null) => {
      for (let current = cell; current; current = current.getParent()) if (hidden.has(current)) return true
      return false
    }
    for (const edge of edges) if (isHidden(edge.getTerminal(true)) || isHidden(edge.getTerminal(false))) hidden.add(edge)

    const touched: Cell[] = []
    const update = (cell: Cell) => {
      for (const child of cell.getChildren()) {
        // Layers of the page are shown or hidden by the participant, not by the plan: only what is in them.
        if (!child.isVertex() && !child.isEdge()) {
          update(child)
          continue
        }
        const id = child.getId() ?? ''
        if (visibility.set(child, 'plan', hidden.has(child))) {
          touched.push(child)
        } else if (drawnAs.get(id) !== marks.get(id)) {
          touched.push(child)
        }
        update(child)
      }
    }
    update(root)
    const changed = touched.length > 0 || next.added !== counts.added || next.removed !== counts.removed
    drawnAs = marks
    counts = next
    if (touched.length > 0) {
      const graphView = graph.getView()
      for (const cell of touched) {
        const state = graphView.getState(cell)
        if (state) state.invalidStyle = true
        graphView.invalidate(cell, true, true)
      }
      graphView.validate()
    }
    return changed
  }

  // A hidden cell is not selected, whatever selects it: a click, a rectangle, «select all».
  const isCellSelectable = graph.isCellSelectable.bind(graph)
  graph.isCellSelectable = (cell) => cell.isVisible() && isCellSelectable(cell)

  // Changes of the page — own, of others, undone — change the marks and what the view leaves out.
  const handleChange = () => {
    if (apply()) onChange()
  }
  graph.getDataModel().addListener(InternalEvent.CHANGE, handleChange)
  apply()

  return {
    view: () => view,
    set(next) {
      if (next === view) return
      view = next
      apply()
      // Every planned cell changes its look between the difference and the states.
      const graphView = graph.getView()
      for (const id of drawnAs.keys()) {
        const cell = graph.getDataModel().getCell(id)
        const state = cell ? graphView.getState(cell) : null
        if (state) state.invalidStyle = true
        if (cell) graphView.invalidate(cell, true, true)
      }
      graphView.validate()
      onChange()
    },
    counts: () => counts,
    destroy() {
      graph.getDataModel().removeListener(handleChange)
    },
  }
}
