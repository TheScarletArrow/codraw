import type { Cell } from '@maxgraph/core'
import { DrawioFormatError, parseDrawio } from '../drawio/parse.ts'
import { cellsModelXml } from '../drawio/serialize.ts'
import { createCell, fromGeometry, fromStyle } from './binding.ts'
import { LAYER_CELL_ID, type CellData } from './model.ts'

/** What the text of the clipboard holds for the canvas: cells of a diagram, or text for a text shape. */
export type ClipboardContent = { kind: 'cells'; cells: Cell[] } | { kind: 'text'; text: string }

/**
 * The text of the clipboard for copied cells: a `<mxGraphModel>` of draw.io encoded with `encodeURIComponent`, as
 * draw.io copies, so that draw.io pastes it too. `cells` are clones that no graph holds, with their descendants; they
 * get ids in the order of the tree, and edges refer to their ends by them.
 */
export function clipboardText(cells: Cell[]): string {
  const ids = new Map<Cell, string>()
  const visit = (cell: Cell) => {
    // The root and the layer of the model take 0 and 1.
    ids.set(cell, String(ids.size + 2))
    cell.getChildren().forEach(visit)
  }
  cells.forEach(visit)
  const data: CellData[] = Array.from(ids, ([cell, id]) => {
    const edge = cell.isEdge()
    const value = cell.getValue()
    const terminal = (source: boolean) => {
      const end = edge ? cell.getTerminal(source) : null
      return end ? (ids.get(end) ?? null) : null
    }
    return {
      id,
      kind: edge ? 'edge' : 'vertex',
      parent: ids.get(cell.getParent()!) ?? LAYER_CELL_ID,
      order: '',
      value: value == null ? '' : String(value),
      geometry: fromGeometry(cell.getGeometry()),
      source: terminal(true),
      target: terminal(false),
      style: fromStyle(cell.getStyle()),
    }
  })
  return encodeURIComponent(cellsModelXml(data))
}

/**
 * Reads the text of the clipboard: a `<mxGraphModel>` or `<mxfile>` of draw.io or CoDraw, encoded or not, becomes
 * cells (of the first page of a file) with their children inside them and edges connected to their ends; any other
 * text that is not empty becomes text without spaces at its ends. `null` when there is nothing to paste.
 */
export async function readClipboardText(text: string): Promise<ClipboardContent | null> {
  const trimmed = text.trim()
  if (!trimmed) return null
  const xml = trimmed.startsWith('%3C') ? decode(trimmed) : trimmed
  if (xml && /^<(mxGraphModel|mxfile)[\s>]/.test(xml)) {
    try {
      const [page] = await parseDrawio(xml)
      const cells = page ? dataToCells(page.cells) : []
      return cells.length > 0 ? { kind: 'cells', cells } : null
    } catch (error) {
      // XML that is not a diagram is pasted as text.
      if (!(error instanceof DrawioFormatError)) throw error
    }
  }
  return { kind: 'text', text: trimmed }
}

function decode(text: string): string | null {
  try {
    return decodeURIComponent(text)
  } catch {
    return null
  }
}

/**
 * Cells of the page from their data: children inside their parents, edges connected to their ends. An edge without
 * one of its ends or the point of that end is left out, since CoDraw keeps no edges hanging in the air.
 */
export function dataToCells(data: CellData[]): Cell[] {
  const cells = new Map(data.map((item) => [item.id, createCell(item)]))
  const kept = data.filter((item) => {
    if (item.kind !== 'edge') return true
    const end = (id: string | null, point: unknown) => (id !== null && cells.has(id)) || point !== undefined
    return end(item.source, item.geometry?.sourcePoint) && end(item.target, item.geometry?.targetPoint)
  })
  const keptIds = new Set(kept.map((item) => item.id))
  const top: Cell[] = []
  for (const item of kept) {
    const cell = cells.get(item.id)!
    const parent = item.parent && keptIds.has(item.parent) ? cells.get(item.parent)! : null
    if (parent) parent.insert(cell)
    else top.push(cell)
    if (item.kind !== 'edge') continue
    if (item.source && keptIds.has(item.source)) cell.setTerminal(cells.get(item.source)!, true)
    if (item.target && keptIds.has(item.target)) cell.setTerminal(cells.get(item.target)!, false)
  }
  return top
}
