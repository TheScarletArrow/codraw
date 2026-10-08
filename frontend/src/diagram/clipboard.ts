import { Cell } from '@maxgraph/core'
import type * as Y from 'yjs'

/**
 * Where copied cells come from: the document of the board, the page, and the id of the cell each clone (also those
 * inside others) is a copy of. «Вставить как тот же элемент» makes the clones cells of the elements of these cells on
 * the same board.
 */
export interface ClipboardSource {
  document: Y.Doc
  pageId: string
  cells: ReadonlyMap<Cell, string>
}

/**
 * Copied cells and the text they went to the clipboard of the system with, shared by the editors of all pages and
 * boards of the browser tab: a new editor is created for every page, but the clipboard stays. The cells are clones
 * that no graph holds.
 */
let content: { cells: Cell[]; text: string; pastes: number; source: ClipboardSource | null } | null = null

export const clipboard = {
  put(cells: Cell[], text = '', source: ClipboardSource | null = null) {
    // `importCells` takes a cell with a relative geometry and no parent for the label of an edge and drops it, and the
    // geometry of an edge is relative: a holder keeps copied edges from being taken for labels.
    const holder = new Cell()
    cells.forEach((cell) => holder.insert(cell))
    content = { cells, text, pastes: 0, source }
  },
  read(): Cell[] | null {
    return content?.cells ?? null
  },
  /** Where the copied cells come from; `null` when they come from the clipboard of the system. */
  source(): ClipboardSource | null {
    return content?.source ?? null
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

/**
 * The text of the clipboard of the system and its HTML, empty when it has none or the browser does not give it, and its
 * pictures, e.g. a screenshot.
 */
export interface SystemClipboard {
  text: string
  html: string
  images: Blob[]
}

/**
 * Reads the clipboard of the system: its text, HTML and pictures where the browser lets the page read them, else its
 * text alone; `null` when the browser does not allow reading it.
 */
export async function readSystemClipboard(): Promise<SystemClipboard | null> {
  if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function') {
    try {
      const items = await navigator.clipboard.read()
      const read = async (type: string) => {
        const item = items.find((candidate) => candidate.types.includes(type))
        return item ? (await item.getType(type)).text() : ''
      }
      const images = await Promise.all(
        items.flatMap((item) => item.types.filter((type) => type.startsWith('image/')).map((type) => item.getType(type))),
      )
      return { text: await read('text/plain'), html: await read('text/html'), images }
    } catch {
      // The browser may refuse more than the text, e.g. without the permission to read; the text may still be allowed.
    }
  }
  if (!canReadSystemClipboard()) return null
  try {
    return { text: await navigator.clipboard.readText(), html: '', images: [] }
  } catch {
    return null
  }
}

/**
 * Writes text, and HTML when there is some, to the clipboard of the system, if the browser allows it; the clipboard of
 * the tab has the cells anyway.
 */
export function writeSystemClipboard(text: string, html: string | null = null) {
  if (typeof navigator === 'undefined') return
  const writeText = () => navigator.clipboard?.writeText?.(text).catch(() => {})
  if (html === null || typeof navigator.clipboard?.write !== 'function' || typeof ClipboardItem === 'undefined') {
    writeText()
    return
  }
  const item = new ClipboardItem({
    'text/plain': new Blob([text], { type: 'text/plain' }),
    'text/html': new Blob([html], { type: 'text/html' }),
  })
  navigator.clipboard.write([item]).catch(writeText)
}
