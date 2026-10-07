import * as Y from 'yjs'
import {
  compareCells,
  getCells,
  LAYER_CELL_ID,
  readAttrs,
  readCell,
  ROOT_CELL_ID,
  type CellData,
  type GeometryData,
  type PointData,
} from '../diagram/model.ts'
import { listPages } from '../diagram/pages.ts'
import { formatStyle } from './style.ts'

/** Media type of draw.io files. */
export const DRAWIO_MIME_TYPE = 'application/vnd.jgraph.mxfile'

/**
 * Escapes a value for an XML attribute. Line breaks are written as character references: an XML parser turns
 * literal ones into spaces, and multi-line labels would become one line.
 */
function escape(value: string): string {
  return Array.from(value)
    .filter(isXmlChar)
    .join('')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '&#xa;')
    .replace(/\r/g, '&#xd;')
    .replace(/\t/g, '&#x9;')
}

/** Control characters other than tab and line breaks are not allowed in XML. */
function isXmlChar(char: string): boolean {
  const code = char.charCodeAt(0)
  return code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d
}

function attributes(values: Record<string, string | number | null | undefined>): string {
  return Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([name, value]) => ` ${name}="${escape(String(value))}"`)
    .join('')
}

const point = (p: PointData, as?: string) => `<mxPoint${attributes({ x: p.x || null, y: p.y || null, as })}/>`

function geometryXml(geometry: GeometryData | null): string {
  if (!geometry) return ''
  const children = [
    geometry.sourcePoint && point(geometry.sourcePoint, 'sourcePoint'),
    geometry.targetPoint && point(geometry.targetPoint, 'targetPoint'),
    geometry.points?.length && `<Array as="points">${geometry.points.map((p) => point(p)).join('')}</Array>`,
    geometry.offset && point(geometry.offset, 'offset'),
  ].filter(Boolean)
  const attrs = attributes({
    x: geometry.x || null,
    y: geometry.y || null,
    width: geometry.width || null,
    height: geometry.height || null,
    relative: geometry.relative ? 1 : null,
    as: 'geometry',
  })
  return children.length > 0 ? `<mxGeometry${attrs}>${children.join('')}</mxGeometry>` : `<mxGeometry${attrs}/>`
}

/**
 * Pictures to write into a file in place of their addresses: the address of each picture of the board, and the picture
 * as a `data:` address, which the file then carries (see `image/inlineImages.ts`).
 */
export type EmbeddedImages = ReadonlyMap<string, string>

function cellXml(cell: CellData, attrs: Record<string, string>, images?: EmbeddedImages): string {
  const kind = cell.kind === 'edge' ? 'edge' : 'vertex'
  const picture = typeof cell.style.image === 'string' ? images?.get(cell.style.image) : undefined
  const body = attributes({
    style: formatStyle(picture ? { ...cell.style, image: picture } : cell.style, kind),
    [kind]: 1,
    parent: cell.parent ?? LAYER_CELL_ID,
    source: cell.source,
    target: cell.target,
  })
  const geometry = geometryXml(cell.geometry)
  const inner = (head: string) => (geometry ? `<mxCell${head}>${geometry}</mxCell>` : `<mxCell${head}/>`)
  if (Object.keys(attrs).length === 0) return inner(attributes({ id: cell.id, value: cell.value }) + body)
  // Custom properties make the cell an <object>, which carries the id and the label.
  const { id: _id, label: _label, ...properties } = attrs
  return `<object${attributes({ label: cell.value, ...properties, id: cell.id })}>${inner(body)}</object>`
}

/**
 * Cells of a page in the order of the tree: every cell is followed by its children, siblings in drawing order. With
 * `only`, just these cells of the layer with their descendants.
 */
function pageCellsXml(doc: Y.Doc, pageId: string, only?: ReadonlySet<string>, images?: EmbeddedImages): string {
  const cells = getCells(doc, pageId)
  const entries = Array.from(cells.entries())
    .filter(([id]) => id !== ROOT_CELL_ID && id !== LAYER_CELL_ID)
    .map(([id, map]) => ({ data: readCell(id, map), attrs: readAttrs(map) }))
  const known = new Set(entries.map(({ data }) => data.id))
  const children = new Map<string, typeof entries>()
  for (const entry of entries) {
    // Cells whose parent is missing are shown on the layer, as the editor does.
    const parent = entry.data.parent && known.has(entry.data.parent) ? entry.data.parent : LAYER_CELL_ID
    entry.data.parent = parent
    children.set(parent, [...(children.get(parent) ?? []), entry])
  }
  const xml: string[] = []
  const visited = new Set<string>()
  const visit = (parent: string) => {
    for (const entry of (children.get(parent) ?? []).sort((a, b) => compareCells(a.data, b.data))) {
      if (visited.has(entry.data.id) || (only && parent === LAYER_CELL_ID && !only.has(entry.data.id))) continue
      visited.add(entry.data.id)
      xml.push(cellXml(entry.data, entry.attrs, images))
      visit(entry.data.id)
    }
  }
  visit(LAYER_CELL_ID)
  return xml.join('')
}

/** Attributes of the model of every diagram that CoDraw writes. */
const MODEL_ATTRIBUTES = attributes({
  grid: 1,
  gridSize: 10,
  guides: 1,
  tooltips: 1,
  connect: 1,
  arrows: 1,
  fold: 1,
  // CoDraw has no pages to print on: the canvas is endless.
  page: 0,
  pageScale: 1,
  pageWidth: 850,
  pageHeight: 1100,
  math: 0,
  shadow: 0,
})

function diagramXml(
  doc: Y.Doc,
  page: { id: string; name: string },
  only?: ReadonlySet<string>,
  images?: EmbeddedImages,
): string {
  return (
    `<diagram${attributes({ id: page.id, name: page.name })}>` +
    `<mxGraphModel${MODEL_ATTRIBUTES}><root><mxCell id="${ROOT_CELL_ID}"/><mxCell id="${LAYER_CELL_ID}" parent="${ROOT_CELL_ID}"/>` +
    pageCellsXml(doc, page.id, only, images) +
    `</root></mxGraphModel></diagram>`
  )
}

const mxfile = (diagrams: string[]) => `<mxfile host="CoDraw" type="device">${diagrams.join('')}</mxfile>\n`

/**
 * Writes cells as a `<mxGraphModel>` of draw.io with its root and layer, as draw.io copies them; cells without a parent
 * are on the layer.
 */
export function cellsModelXml(cells: CellData[]): string {
  return (
    `<mxGraphModel><root><mxCell id="${ROOT_CELL_ID}"/><mxCell id="${LAYER_CELL_ID}" parent="${ROOT_CELL_ID}"/>` +
    cells.map((cell) => cellXml(cell, {})).join('') +
    `</root></mxGraphModel>`
  )
}

/** Writes all pages of the board as an uncompressed `.drawio` file, with the `images` in it instead of their addresses. */
export function exportDrawio(doc: Y.Doc, images?: EmbeddedImages): string {
  return mxfile(listPages(doc).map((page) => diagramXml(doc, page, undefined, images)))
}

/**
 * Writes one page of the board as an uncompressed `.drawio` file, or with `cellIds` only these cells of the page with
 * their descendants, with the `images` in it instead of their addresses; `null` for an unknown page.
 */
export function exportDrawioPage(
  doc: Y.Doc,
  pageId: string,
  cellIds?: readonly string[],
  images?: EmbeddedImages,
): string | null {
  const page = listPages(doc).find((candidate) => candidate.id === pageId)
  return page ? mxfile([diagramXml(doc, page, cellIds && new Set(cellIds), images)]) : null
}
