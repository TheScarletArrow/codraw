import { Cell } from '@maxgraph/core'

/**
 * Copied cells and the text they went to the clipboard of the system with, shared by the editors of all pages and
 * boards of the browser tab: a new editor is created for every page, but the clipboard stays. The cells are clones
 * that no graph holds.
 */
let content: { cells: Cell[]; text: string; pastes: number } | null = null

export const clipboard = {
  put(cells: Cell[], text = '') {
    // `importCells` takes a cell with a relative geometry and no parent for the label of an edge and drops it, and the
    // geometry of an edge is relative: a holder keeps copied edges from being taken for labels.
    const holder = new Cell()
    cells.forEach((cell) => holder.insert(cell))
    content = { cells, text, pastes: 0 }
  },
  read(): Cell[] | null {
    return content?.cells ?? null
  },
  /** The text of the clipboard of the system that the copied cells were written as; `null` when nothing is copied. */
  text(): string | null {
    return content?.text ?? null
  },
  /** Number of the next paste of the same content with the keyboard, starting from 1. */
  nextPaste(): number {
    return content ? ++content.pastes : 0
  },
}

/** The browser lets the page read the clipboard of the system, possibly after asking the user. */
export function canReadSystemClipboard(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function'
}

/** Reads the text of the clipboard of the system; `null` when the browser does not allow it. */
export async function readSystemClipboard(): Promise<string | null> {
  if (!canReadSystemClipboard()) return null
  try {
    return await navigator.clipboard.readText()
  } catch {
    return null
  }
}

/** Writes text to the clipboard of the system, if the browser allows it; the clipboard of the tab has the cells anyway. */
export function writeSystemClipboard(text: string) {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') return
  navigator.clipboard.writeText(text).catch(() => {})
}
