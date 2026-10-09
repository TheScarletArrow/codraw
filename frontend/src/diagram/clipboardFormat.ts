import type { Cell } from '@maxgraph/core'
import { DrawioFormatError, parseDrawio } from '../drawio/parse.ts'
import { cellsModelXml } from '../drawio/serialize.ts'
import { mermaidCells } from '../mermaid/mermaidCells.ts'
import { isMermaid, MermaidError, parseMermaid } from '../mermaid/parseMermaid.ts'
import { diagramSchema, schemaCells, schemaSql } from '../sql/erDiagram.ts'
import { parseSql } from '../sql/parseSql.ts'
import { createCell, fromGeometry, fromStyle } from './binding.ts'
import { LAYER_CELL_ID, type CellData } from './model.ts'
import { isTableStyle, type ShapeStyle } from './shapes.ts'

/**
 * What the text of the clipboard holds for the canvas: cells of a diagram, a new diagram drawn from its text (Mermaid),
 * which has no place of its own yet, or text for a text shape.
 */
export type ClipboardContent = { kind: 'cells' | 'diagram'; cells: Cell[] } | { kind: 'text'; text: string }

/**
 * The text of the clipboard for copied cells: a `<mxGraphModel>` of draw.io encoded with `encodeURIComponent`, as
 * draw.io copies, so that draw.io pastes it too. `cells` are clones that no graph holds, with their descendants.
 */
export function clipboardText(cells: Cell[]): string {
  return encodeURIComponent(cellsXml(cells))
}

/**
 * Copied cells as a `<mxGraphModel>` of draw.io, as the clipboard holds them and components of libraries keep them.
 * `cells` are clones that no graph holds, with their descendants.
 */
export function cellsXml(cells: Cell[]): string {
  return cellsModelXml(clipboardData(cells))
}

/** Attribute of the HTML of the clipboard that holds the copied cells as {@link clipboardText} writes them. */
const DIAGRAM_ATTRIBUTE = 'data-codraw'

/**
 * What copied cells put into the clipboard of the system. Tables and views alone, with their edges, are SQL for other
 * programs: the text is their DDL, and the HTML is the same DDL with the cells in {@link DIAGRAM_ATTRIBUTE}, which CoDraw
 * pastes. Anything else, and base tables alone, which have no DDL, are the text of {@link clipboardText} without HTML.
 */
export function clipboardContent(cells: Cell[]): { text: string; html: string | null } {
  const data = clipboardData(cells)
  const diagram = encodeURIComponent(cellsModelXml(data))
  const shapes = data.filter((cell) => cell.parent === LAYER_CELL_ID && cell.kind === 'vertex')
  const tablesOnly = shapes.length > 0 && shapes.every((cell) => isTableStyle(cell.style as ShapeStyle))
  const schema = tablesOnly ? diagramSchema(data) : null
  if (!schema || schema.tables.length + schema.views.length === 0) return { text: diagram, html: null }
  const sql = schemaSql(schema)
  const escaped = sql.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return { text: sql, html: `<meta charset="utf-8"><pre ${DIAGRAM_ATTRIBUTE}="${diagram}">${escaped}</pre>` }
}

/**
 * Data of copied cells: they get ids in the order of the tree, and edges refer to their ends by them; cells whose
 * parent was not copied are on the layer.
 */
function clipboardData(cells: Cell[]): CellData[] {
  const ids = new Map<Cell, string>()
  const visit = (cell: Cell) => {
    // The root and the layer of the model take 0 and 1.
    ids.set(cell, String(ids.size + 2))
    cell.getChildren().forEach(visit)
  }
  cells.forEach(visit)
  return Array.from(ids, ([cell, id]) => {
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
}

/**
 * Reads the clipboard: cells that CoDraw put into its HTML, or its text. A `<mxGraphModel>` or `<mxfile>` of draw.io or
 * CoDraw, encoded or not, becomes cells (of the first page of a file) with their children inside them and edges
 * connected to their ends; a flowchart or an ER diagram of Mermaid, and DDL with tables or views, become a laid out diagram; any
 * other text that is not empty becomes text without spaces at its ends. `null` when there is nothing to paste.
 */
export async function readClipboardText(text: string, html = ''): Promise<ClipboardContent | null> {
  const embedded = embeddedDiagram(html)
  const fromHtml = embedded === null ? undefined : await diagramContent(embedded)
  if (fromHtml !== undefined) return fromHtml
  const trimmed = text.trim()
  if (!trimmed) return null
  const fromText = await diagramContent(trimmed)
  if (fromText !== undefined) return fromText
  if (isMermaid(trimmed)) {
    try {
      const cells = dataToCells(await mermaidCells(parseMermaid(trimmed), { x: 0, y: 0 }))
      // Text that only looks like Mermaid, without a node, is pasted as text.
      if (cells.some((cell) => cell.isVertex())) return { kind: 'diagram', cells }
    } catch (error) {
      if (!(error instanceof MermaidError)) throw error
    }
  }
  const schema = parseSql(trimmed)
  if (schema.tables.length + schema.views.length > 0) return { kind: 'diagram', cells: dataToCells(await schemaCells(schema, { x: 0, y: 0 })) }
  return { kind: 'text', text: trimmed }
}

/**
 * The cells of a `<mxGraphModel>` or `<mxfile>` of draw.io or CoDraw (e.g. a component of a library), as
 * {@link readClipboardText} reads them; `[]` for text that is no diagram.
 */
export async function diagramCells(xml: string): Promise<Cell[]> {
  const content = await diagramContent(xml.trim())
  return content?.kind === 'cells' ? content.cells : []
}

/** The cells that {@link clipboardContent} put into the HTML of the clipboard; `null` without them. */
function embeddedDiagram(html: string): string | null {
  if (!html.includes(DIAGRAM_ATTRIBUTE)) return null
  // A parsed document runs no scripts and loads nothing.
  return new DOMParser().parseFromString(html, 'text/html').querySelector(`[${DIAGRAM_ATTRIBUTE}]`)?.getAttribute(DIAGRAM_ATTRIBUTE) ?? null
}

/** The cells of a diagram of draw.io or CoDraw, encoded or not; `undefined` for text that is not one. */
async function diagramContent(text: string): Promise<ClipboardContent | null | undefined> {
  const xml = text.startsWith('%3C') ? decode(text) : text
  if (!xml || !/^<(mxGraphModel|mxfile)[\s>]/.test(xml)) return undefined
  try {
    const [page] = await parseDrawio(xml)
    const cells = page ? dataToCells(page.cells) : []
    return cells.length > 0 ? { kind: 'cells', cells } : null
  } catch (error) {
    // XML that is not a diagram is pasted as text.
    if (!(error instanceof DrawioFormatError)) throw error
    return undefined
  }
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
 * one of its ends or the point of that end is left out, since CoDraw keeps no edges hanging in the air. Layers, e.g. of
 * a diagram of draw.io, are left out too: what they hold is at the top.
 */
export function dataToCells(all: CellData[]): Cell[] {
  const data = all.filter((item) => item.kind !== 'layer')
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
