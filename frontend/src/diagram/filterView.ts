import { InternalEvent, type Cell, type Graph } from '@maxgraph/core'
import { filterCounts, filteredOut, isFilterActive, type FilterRecord, type PageFilter } from './pageFilter.ts'
import { cellVisibility, type CellVisibility } from './cellVisibility.ts'

/**
 * The filter of a page on the canvas (see `pageFilter.ts`): a cell that does not match is drawn pale, a hook of the style
 * giving it a quarter of its opacity, or, when the filter hides, is made invisible in the model of this editor alone —
 * `Cell.setVisible` changes no model and so no document, and maxGraph keeps no state of an invisible cell: it is not
 * drawn, selected nor hit. After every change of the model the filter is worked out anew, and only the cells whose look
 * changed are drawn again.
 */

/** How much of its opacity a cell that does not match keeps. */
export const DIMMED_OPACITY = 0.25

/** What the filter does to a cell. */
export type FilterStatus = 'dimmed' | 'hidden' | null

/** The cells of the model in drawing order as the filter reads them. */
export function modelFilterRecords(graph: Graph): FilterRecord[] {
  const records: FilterRecord[] = []
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

export interface FilterView {
  /** The filter shown, or `null` without one. */
  filter(): PageFilter | null
  /** Shows the page through `filter`; `null`, or one that chooses nothing, shows everything. */
  set(filter: PageFilter | null): void
  status(cell: Cell): FilterStatus
  /** How many elements of the page match, of how many; `null` without a filter. */
  counts(): { matched: number; total: number } | null
  /**
   * Runs `run` with the page drawn otherwise — with what does not match hidden, or without the filter — and draws it
   * back as it was, in the same task, which nobody sees.
   */
  drawn<T>(as: 'hidden' | 'unfiltered', run: () => T): T
  destroy(): void
}

/**
 * The filter of the canvas of `graph`. Call before the hook of the theme, so that the theme sees the pale style. `onChange`
 * hears when what the filter does to the page changed.
 */
export function configureFilter(
  graph: Graph,
  onChange: () => void,
  visibility: CellVisibility = cellVisibility(),
): FilterView {
  let current: PageFilter | null = null
  let out = new Set<string>()
  let hiding = false
  let counts: { matched: number; total: number } | null = null

  const getCellStyle = graph.getCellStyle.bind(graph)
  graph.getCellStyle = (cell) => {
    const style = getCellStyle(cell)
    const id = cell?.getId()
    if (hiding || !id || !out.has(id)) return style
    return {
      ...style,
      opacity: (style.opacity ?? 100) * DIMMED_OPACITY,
      textOpacity: (style.textOpacity ?? 100) * DIMMED_OPACITY,
    }
  }

  /** Shows the cells as `filter` wants them: those whose look changes are drawn again. */
  const apply = (filter: PageFilter | null) => {
    const active = isFilterActive(filter) ? filter : null
    const records = active ? modelFilterRecords(graph) : []
    const next = active ? filteredOut(records, active) : new Set<string>()
    const hide = active?.hide ?? false
    const touched: Cell[] = []
    const visit = (cell: Cell) => {
      for (const child of cell.getChildren()) {
        // Layers of the page are shown or hidden by the participant, not by the filter: only what is in them.
        if (!child.isVertex() && !child.isEdge()) {
          visit(child)
          continue
        }
        const id = child.getId() ?? ''
        const was = out.has(id)
        const is = next.has(id)
        if (visibility.set(child, 'filter', hide && is)) {
          touched.push(child)
        } else if (was !== is || (is && hiding !== hide)) {
          touched.push(child)
        }
        visit(child)
      }
    }
    const root = graph.getDataModel().getRoot()
    if (root) visit(root)
    const changed = touched.length > 0 || (current === null) !== (active === null)
    current = active
    out = next
    hiding = hide
    counts = active ? filterCounts(records, active) : null
    if (touched.length > 0) {
      const view = graph.getView()
      for (const cell of touched) {
        const state = view.getState(cell)
        if (state) state.invalidStyle = true
        view.invalidate(cell, true, true)
      }
      view.validate()
    }
    return changed
  }

  // A hidden cell is not selected, whatever selects it: a click, a rectangle, «select all».
  const isCellSelectable = graph.isCellSelectable.bind(graph)
  graph.isCellSelectable = (cell) => cell.isVisible() && isCellSelectable(cell)

  // Changes of the page — own, of others, undone — may change what matches.
  const handleChange = () => {
    if (current && apply(current)) onChange()
  }
  graph.getDataModel().addListener(InternalEvent.CHANGE, handleChange)

  return {
    filter: () => current,
    set(filter) {
      apply(filter)
      onChange()
    },
    status(cell) {
      const id = cell.getId()
      if (!id || !out.has(id)) return null
      return hiding ? 'hidden' : 'dimmed'
    },
    counts: () => counts,
    drawn(as, run) {
      const shown = current
      if (!shown) return run()
      apply(as === 'hidden' ? { ...shown, hide: true } : null)
      try {
        return run()
      } finally {
        apply(shown)
      }
    },
    destroy() {
      graph.getDataModel().removeListener(handleChange)
    },
  }
}
