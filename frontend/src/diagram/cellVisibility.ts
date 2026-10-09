import type { Cell } from '@maxgraph/core'

/**
 * What hides the shapes and edges of the canvas of one editor, besides their layers: the filter of the page, the view of
 * the plan. A cell is drawn while none of them hides it, so that one of them does not show again what another hides.
 */
export interface CellVisibility {
  /** Hides `cell` for `by`, or stops hiding it for `by`; returns whether the cell was shown or hidden by that. */
  set(cell: Cell, by: string, hidden: boolean): boolean
}

export function cellVisibility(): CellVisibility {
  // Cells that leave the model take what hid them along.
  const hiders = new WeakMap<Cell, Set<string>>()
  return {
    set(cell, by, hidden) {
      let set = hiders.get(cell)
      if (hidden && !set) hiders.set(cell, (set = new Set()))
      if (hidden) set!.add(by)
      else set?.delete(by)
      const visible = !set || set.size === 0
      if (cell.isVisible() === visible) return false
      cell.setVisible(visible)
      return true
    },
  }
}
