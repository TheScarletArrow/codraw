import { generateNKeysBetween } from 'fractional-indexing'
import { newId } from '../diagram/ids.ts'
import { EDGE_API_KEY, edgeApiOf } from '../diagram/edgeApi.ts'
import {
  edgeProperties,
  edgePropertiesStyle,
  INTERACTION_KEY,
  kindOfC4Type,
  normalizeProperties,
  propertiesStyle,
  TECHNOLOGY_KEY,
} from '../diagram/elementKinds.ts'
import { LINK_KEY, linkOf } from '../diagram/links.ts'
import {
  ELEMENT_KEY,
  HIDDEN_LAYER_KEY,
  LAYER_CELL_ID,
  ROOT_CELL_ID,
  type CellData,
  type GeometryData,
  type PointData,
  type StyleValue,
} from '../diagram/model.ts'
import { isLegendStyle } from '../diagram/legend.ts'
import { htmlToText } from './labels.ts'
import { isLegendPart, legendFromFile } from './legendDrawio.ts'
import { parseStyle } from './style.ts'

/** The file is not a draw.io diagram. */
export class DrawioFormatError extends Error {
  constructor(message = 'Это не файл draw.io', options?: ErrorOptions) {
    super(message, options)
    this.name = 'DrawioFormatError'
  }
}

/** A cell of a page as the board document stores it, with the custom properties of `<object>`. */
export interface DrawioCell extends CellData {
  attrs?: Record<string, string>
}

/** A page (`<diagram>`) of a draw.io file; the root is implied. */
export interface DrawioPage {
  /** Id of the diagram in the file, if it has one. */
  id: string | null
  name: string
  /** The shapes and edges of the page, those of its layers in them. */
  cells: DrawioCell[]
  /**
   * The layers of the page in drawing order, the first one the main layer `1` of the page; without them, the page has
   * only its main layer, as the default one.
   */
  layers?: DrawioCell[]
}

/** Reads the pages of a `.drawio` file, of a single `<mxGraphModel>` or of a `.drawio.svg` file. */
export async function parseDrawio(text: string): Promise<DrawioPage[]> {
  let root = parseXml(text)
  if (root.localName === 'svg') {
    const content = root.getAttribute('content')
    if (!content) throw new DrawioFormatError()
    root = parseXml(content)
  }
  if (root.nodeName === 'mxGraphModel') return [readModel(root, null, 'Страница 1')]
  if (root.nodeName !== 'mxfile') throw new DrawioFormatError()

  const diagrams = childElements(root, 'diagram')
  if (diagrams.length === 0) throw new DrawioFormatError()
  const pages: DrawioPage[] = []
  for (const [index, diagram] of diagrams.entries()) {
    const model = childElements(diagram, 'mxGraphModel')[0] ?? parseXml(await decompress(diagram.textContent ?? ''))
    if (model.nodeName !== 'mxGraphModel') throw new DrawioFormatError()
    pages.push(readModel(model, diagram.getAttribute('id'), diagram.getAttribute('name') || `Страница ${index + 1}`))
  }
  return pages
}

function parseXml(text: string): Element {
  const document = new DOMParser().parseFromString(text, 'text/xml')
  if (document.getElementsByTagName('parsererror').length > 0) throw new DrawioFormatError()
  return document.documentElement
}

function childElements(element: Element, name?: string): Element[] {
  return Array.from(element.children).filter((child) => name === undefined || child.nodeName === name)
}

/** Unpacks a compressed diagram: base64 of raw deflate of the URI-encoded XML, as draw.io writes it. */
async function decompress(content: string): Promise<string> {
  const data = content.trim()
  if (data.startsWith('<')) return data
  let bytes: Uint8Array
  try {
    bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
  } catch (error) {
    throw new DrawioFormatError(undefined, { cause: error })
  }
  const inflated = await inflateRaw(bytes).catch((error: unknown) => {
    throw new DrawioFormatError(undefined, { cause: error })
  })
  try {
    return decodeURIComponent(inflated)
  } catch {
    // Old files are compressed without URI encoding.
    return inflated
  }
}

async function inflateRaw(bytes: Uint8Array): Promise<string> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  }).pipeThrough(new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}

interface RawCell {
  id: string
  parent: string | null
  element: Element
  value: string
  attrs: Record<string, string>
  /** The `link` attribute of the element around the cell. */
  link: string | null
  /** The `codrawApi` attribute of the element around the cell: the description of the call of an edge. */
  api: string | null
}

/**
 * Converts the cells of a model: the root becomes `0`, the first layer the main layer `1`, the other layers keep their
 * ids when they can, and the order follows the file.
 */
function readModel(model: Element, id: string | null, name: string): DrawioPage {
  const rootElement = childElements(model, 'root')[0]
  if (!rootElement) throw new DrawioFormatError()

  const raw: RawCell[] = []
  for (const element of childElements(rootElement)) {
    if (element.nodeName === 'mxCell') {
      raw.push({
        id: element.getAttribute('id') ?? '',
        parent: element.getAttribute('parent'),
        element,
        value: element.getAttribute('value') ?? '',
        attrs: {},
        link: null,
        api: null,
      })
    } else if (element.nodeName === 'object' || element.nodeName === 'UserObject') {
      // A cell with a link or custom properties: the attributes of the wrapper and the cell inside it.
      const cell = childElements(element, 'mxCell')[0]
      if (!cell) continue
      const attrs: Record<string, string> = {}
      for (const attribute of Array.from(element.attributes)) {
        if (!['id', 'label', 'link', 'placeholders', EDGE_API_KEY].includes(attribute.name)) attrs[attribute.name] = attribute.value
      }
      const label = element.getAttribute('label') ?? ''
      raw.push({
        id: element.getAttribute('id') ?? '',
        parent: cell.getAttribute('parent'),
        element: cell,
        // The label of draw.io with placeholders shows the values of the attributes in their places.
        value: element.getAttribute('placeholders') === '1' ? withPlaceholders(label, attrs, isHtml(cell.getAttribute('style') ?? '')) : label,
        attrs,
        link: element.getAttribute('link'),
        api: element.getAttribute(EDGE_API_KEY),
      })
    }
  }

  const root = raw.find((cell) => !cell.parent)
  const layerCells = root ? raw.filter((cell) => cell.parent === root.id) : []
  const layers = new Set(layerCells.map((cell) => cell.id))
  const ids = new Map<string, string>()
  if (root) ids.set(root.id, ROOT_CELL_ID)
  const used = new Set([ROOT_CELL_ID, LAYER_CELL_ID])
  layerCells.forEach((layer, index) => {
    const kept = index === 0 ? LAYER_CELL_ID : layer.id && !used.has(layer.id) ? layer.id : newId()
    used.add(kept)
    ids.set(layer.id, kept)
  })
  const content = raw.filter((cell) => cell !== root && !layers.has(cell.id))
  for (const cell of content) {
    const kept = cell.id && !used.has(cell.id) ? cell.id : newId()
    used.add(kept)
    ids.set(cell.id, kept)
  }
  const reference = (value: string | null) => (value !== null && ids.has(value) ? ids.get(value)! : null)
  // A layer hidden in the file is hidden for everybody, and a locked one is locked.
  const layerData: DrawioCell[] = layerCells.map((layer) => {
    const style = parseStyle(layer.element.getAttribute('style') ?? '', 'layer')
    if (layer.element.getAttribute('visible') === '0') style[HIDDEN_LAYER_KEY] = true
    return {
      id: ids.get(layer.id)!,
      kind: 'layer',
      parent: ROOT_CELL_ID,
      order: '',
      value: layer.value.replace(/\s+/g, ' ').trim().slice(0, 100),
      geometry: null,
      source: null,
      target: null,
      style,
    }
  })

  const read: DrawioCell[] = content.map((cell) => {
    const element = cell.element
    const kind = element.getAttribute('edge') === '1' ? 'edge' : 'vertex'
    const styleText = element.getAttribute('style') ?? ''
    const style = parseStyle(styleText, kind)
    if (element.getAttribute('connectable') === '0') style.connectable = false
    // A link that CoDraw would not open, e.g. `javascript:`, is dropped.
    const link = linkOf({ [LINK_KEY]: cell.link })
    if (link) style[LINK_KEY] = link
    // A description that CoDraw cannot read is dropped.
    if (kind === 'edge' && edgeApiOf({ [EDGE_API_KEY]: cell.api })) style[EDGE_API_KEY] = cell.api!
    Object.assign(style, kind === 'edge' ? edgePropertiesOf(cell.attrs) : elementPropertiesOf(cell.attrs, style))
    const html = isHtml(styleText)
    const parent = reference(cell.parent)
    return {
      id: ids.get(cell.id)!,
      kind,
      // Cells whose parent is missing go to the main layer of the page.
      parent: parent === null || parent === ROOT_CELL_ID ? LAYER_CELL_ID : parent,
      order: '',
      value: html ? htmlToText(cell.value) : cell.value,
      geometry: readGeometry(childElements(element, 'mxGeometry')[0]),
      source: kind === 'edge' ? reference(element.getAttribute('source')) : null,
      target: kind === 'edge' ? reference(element.getAttribute('target')) : null,
      style,
      ...(Object.keys(cell.attrs).length > 0 && { attrs: cell.attrs }),
    }
  })

  const cells = withLegends(read)

  // Siblings, layers too, are drawn in the order of the file.
  const siblings = new Map<string, DrawioCell[]>()
  for (const cell of [...layerData, ...cells]) siblings.set(cell.parent!, [...(siblings.get(cell.parent!) ?? []), cell])
  siblings.forEach((group) => {
    const keys = generateNKeysBetween(null, null, group.length)
    group.forEach((cell, index) => (cell.order = keys[index]!))
  })
  return { id, name, cells, ...(layerData.length > 0 && { layers: layerData }) }
}

/**
 * A legend that CoDraw wrote is a legend again: it lists the items of its page itself, so its samples and names, with
 * what lies on them, are left out.
 */
function withLegends(cells: DrawioCell[]): DrawioCell[] {
  const legends = new Set(cells.filter((cell) => cell.kind === 'vertex' && isLegendStyle(cell.style)).map((cell) => cell.id))
  if (legends.size === 0) return cells
  const dropped = new Set(cells.filter((cell) => cell.parent !== null && legends.has(cell.parent) && isLegendPart(cell.style)).map((cell) => cell.id))
  for (let grown = true; grown; ) {
    grown = false
    for (const cell of cells) {
      if (!dropped.has(cell.id) && cell.parent !== null && dropped.has(cell.parent)) {
        dropped.add(cell.id)
        grown = true
      }
    }
  }
  return cells
    .filter((cell) => !dropped.has(cell.id))
    .map((cell) => (legends.has(cell.id) ? { ...cell, style: legendFromFile(cell.style) } : cell))
}

const isHtml = (style: string) => /(^|;)\s*html=1\s*(;|$)/.test(style)

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

/**
 * A label of draw.io with placeholders: `%name%` becomes the value of the attribute `name` of its element, escaped in a
 * label of HTML; `%%` stays, as do placeholders of no attribute, e.g. `%page%`.
 */
function withPlaceholders(label: string, attrs: Record<string, string>, html: boolean): string {
  return label.replace(/%([^%\s"'=;{}]+)%/g, (placeholder, name: string) => {
    if (!Object.hasOwn(attrs, name)) return placeholder
    const value = attrs[name]!
    return html ? value.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char]!) : value
  })
}

/** Attributes that make the properties of an element in the files of CoDraw. */
const CODRAW_PROPERTIES = ['name', 'kind', 'technology', 'description', 'owner', 'tags'] as const

/** Attributes of the shapes of C4 of draw.io. */
const C4_PROPERTIES = ['c4Name', 'c4Type', 'c4Technology', 'c4Description'] as const

/** Takes the attributes `names` out of the custom properties. */
function take(attrs: Record<string, string>, names: readonly string[]): Record<string, string> {
  const taken: Record<string, string> = {}
  for (const name of names) {
    if (!Object.hasOwn(attrs, name)) continue
    taken[name] = attrs[name]!
    delete attrs[name]
  }
  return taken
}

/**
 * The properties of the element of a shape, as style keys, from the attributes of its `<object>`: those of CoDraw with
 * `codrawElement`, or those of a shape of C4 of draw.io; nothing otherwise. The attributes taken leave the custom
 * properties; a shape of properties without an element gets a new one.
 */
function elementPropertiesOf(attrs: Record<string, string>, style: Record<string, StyleValue>): Record<string, StyleValue> {
  let properties
  if (attrs[ELEMENT_KEY]) {
    properties = normalizeProperties(take(attrs, CODRAW_PROPERTIES))
  } else if (C4_PROPERTIES.some((name) => Object.hasOwn(attrs, name))) {
    const c4 = take(attrs, C4_PROPERTIES)
    const type = c4.c4Type ?? ''
    // draw.io draws a database of C4 as a container in a cylinder.
    const cylinder = String(style.shape ?? '').startsWith('cylinder')
    const kind = /^container$/i.test(type.trim()) && cylinder ? 'c4-database' : kindOfC4Type(type, null)
    properties = normalizeProperties({ name: c4.c4Name, kind, technology: c4.c4Technology, description: c4.c4Description })
  } else {
    return {}
  }
  const element = take(attrs, [ELEMENT_KEY])[ELEMENT_KEY] || newId()
  const keys: Record<string, StyleValue> = { [ELEMENT_KEY]: element }
  for (const [key, value] of Object.entries(propertiesStyle(properties))) if (value !== undefined) keys[key] = value
  return keys
}

/** The properties of an edge, as style keys, from `technology` and `interaction` of its `<object>`, or `c4Technology`. */
function edgePropertiesOf(attrs: Record<string, string>): Record<string, StyleValue> {
  const taken = take(attrs, ['technology', 'interaction', 'c4Technology'])
  const properties = edgeProperties({
    [TECHNOLOGY_KEY]: taken.technology ?? taken.c4Technology,
    [INTERACTION_KEY]: taken.interaction,
  })
  const keys: Record<string, StyleValue> = {}
  for (const [key, value] of Object.entries(edgePropertiesStyle(properties))) if (value !== undefined) keys[key] = value
  return keys
}

const number = (element: Element, name: string) => {
  const value = Number(element.getAttribute(name) ?? 0)
  return Number.isFinite(value) ? value : 0
}

const readPoint = (element: Element): PointData => ({ x: number(element, 'x'), y: number(element, 'y') })

function readGeometry(element: Element | undefined): GeometryData | null {
  if (!element) return null
  const geometry: GeometryData = {
    x: number(element, 'x'),
    y: number(element, 'y'),
    width: number(element, 'width'),
    height: number(element, 'height'),
  }
  if (element.getAttribute('relative') === '1') geometry.relative = true
  for (const child of childElements(element)) {
    const as = child.getAttribute('as')
    if (child.nodeName === 'mxPoint' && (as === 'sourcePoint' || as === 'targetPoint' || as === 'offset')) {
      const point = readPoint(child)
      // draw.io writes an empty offset for every label of an edge.
      if (as !== 'offset' || point.x !== 0 || point.y !== 0) geometry[as] = point
    } else if (child.nodeName === 'Array' && as === 'points') {
      const points = childElements(child, 'mxPoint').map(readPoint)
      if (points.length > 0) geometry.points = points
    }
  }
  return geometry
}
