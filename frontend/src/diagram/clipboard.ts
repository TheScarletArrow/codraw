import { Cell } from '@maxgraph/core'

/**
 * Copied cells, shared by the editors of all pages and boards of the browser tab: a new editor is created for every
 * page, but the clipboard stays. The cells are clones that no graph holds.
 */
let content: { cells: Cell[]; pastes: number } | null = null

export const clipboard = {
  put(cells: Cell[]) {
    // `importCells` takes a cell with a relative geometry and no parent for the label of an edge and drops it, and the
    // geometry of an edge is relative: a holder keeps copied edges from being taken for labels.
    const holder = new Cell()
    cells.forEach((cell) => holder.insert(cell))
    content = { cells, pastes: 0 }
  },
  read(): Cell[] | null {
    return content?.cells ?? null
  },
  /** Number of the next paste of the same content with the keyboard, starting from 1. */
  nextPaste(): number {
    return content ? ++content.pastes : 0
  },
}
