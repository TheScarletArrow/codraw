import { LAYER_CELL_ID, type CellData } from '../diagram/model.ts'

/** What an element of C4 is. */
export type ElementKind = 'person' | 'system' | 'container' | 'component'

/** How an element is drawn in C4: a box, a cylinder of data or a pipe of messages. */
export type ElementVariant = 'plain' | 'database' | 'queue'

/** What a frame around elements is: a software system, a container, or a group of no kind of C4. */
export type BoundaryKind = 'system' | 'container' | 'group'

export interface ArchElement {
  type: 'element'
  /** The identifier in the code, unique on the page. */
  id: string
  kind: ElementKind
  variant: ElementVariant
  external: boolean
  name: string
  technology: string
  description: string
}

export interface ArchBoundary {
  type: 'boundary'
  id: string
  kind: BoundaryKind
  name: string
  children: ArchNode[]
}

export type ArchNode = ArchElement | ArchBoundary

export interface ArchRelation {
  source: ArchElement
  target: ArchElement
  description: string
  technology: string
}

/** The architecture of a page: its elements in the frames they lie in, the relations between them, what is left out. */
export interface ArchModel {
  /** The name of the board, and of the page when the board has several. */
  title: string
  roots: ArchNode[]
  relations: ArchRelation[]
  /** Shapes of the page that are no element of C4 and no frame: tables, stickers, text, pictures. */
  skipped: number
}

type Mapping = { kind: ElementKind; variant?: ElementVariant; external?: boolean } | { boundary: BoundaryKind | 'c4' }

/** Elements and frames by the shapes of the palette; other shapes are left out. */
const SHAPES: Record<string, Mapping> = {
  'c4-person': { kind: 'person' },
  'c4-system': { kind: 'system' },
  'c4-container': { kind: 'container' },
  'c4-component': { kind: 'component' },
  'c4-database': { kind: 'container', variant: 'database' },
  'c4-external-system': { kind: 'system', external: true },
  'c4-boundary': { boundary: 'c4' },
  user: { kind: 'person' },
  'external-system': { kind: 'system', external: true },
  'uml-component': { kind: 'component' },
  boundary: { boundary: 'group' },
  'kubernetes-cluster': { boundary: 'group' },
  'uml-package': { boundary: 'group' },
  database: { kind: 'container', variant: 'database' },
  cache: { kind: 'container', variant: 'database' },
  'object-storage': { kind: 'container', variant: 'database' },
  'search-index': { kind: 'container', variant: 'database' },
  'data-warehouse': { kind: 'container', variant: 'database' },
  queue: { kind: 'container', variant: 'queue' },
  'event-topic': { kind: 'container', variant: 'queue' },
  ...Object.fromEntries(
    [
      'service',
      'load-balancer',
      'api-gateway',
      'cdn',
      'server',
      'container',
      'firewall',
      'dns',
      'scheduler',
      'function',
      'browser',
      'mobile-app',
      'desktop-app',
      'iot-device',
    ].map((id) => [id, { kind: 'container' } as Mapping]),
  ),
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

/** The lines of a label; a label of HTML from draw.io becomes its text, a line a `<br>`, `<div>` or `<p>`. */
export function labelLines(cell: CellData): string[] {
  let text = cell.value
  if (cell.style.html === true || cell.style.html === 1 || cell.style.html === '1' || /<(br|div|p|span|b|i)\b/i.test(text)) {
    text = text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(div|p)\b[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&(#39|[a-z]+);/gi, (entity, name: string) => ENTITIES[name.toLowerCase()] ?? entity)
  }
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** `[Container: Spring Boot]`: the type and the technology of the second line of a label of C4. */
const C4_TYPE = /^\[([^:\]]+)(?::\s*([^\]]*))?\]$/

/** A label of a relation: `Использует [HTTPS]`, on one line or two. */
const RELATION = /^([\s\S]*?)\s*\[([^\]]+)\]\s*$/

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y',
  ь: '', э: 'e', ю: 'yu', я: 'ya',
}

/** An identifier for a name: latin letters, digits and `_`, Cyrillic transliterated, never starting with a digit. */
export function identifier(name: string, fallback: string): string {
  const latin = [...name.toLowerCase()].map((char) => CYRILLIC[char] ?? char).join('')
  const plain = latin.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const base = plain || fallback
  return /^\d/.test(base) ? `e_${base}` : base
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

const area = (box: Box) => box.width * box.height
const holds = (frame: Box, box: Box) => {
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  return x >= frame.x && x <= frame.x + frame.width && y >= frame.y && y <= frame.y + frame.height
}

/** The architecture of the cells of a page, named `title`. */
export function architectureModel(cells: CellData[], title: string): ArchModel {
  const byId = new Map(cells.map((cell) => [cell.id, cell]))
  /** Where a cell is on the page: its geometry with the offsets of the groups it is in. */
  const boxOf = (cell: CellData): Box => {
    let { x, y } = cell.geometry!
    for (let parent = cell.parent ? byId.get(cell.parent) : undefined; parent && parent.id !== LAYER_CELL_ID; parent = parent.parent ? byId.get(parent.parent) : undefined) {
      if (parent.kind === 'vertex' && parent.geometry && !parent.geometry.relative) {
        x += parent.geometry.x
        y += parent.geometry.y
      }
    }
    return { x, y, width: cell.geometry!.width, height: cell.geometry!.height }
  }
  /** A shape of the page itself, or of a group: not a field of a table nor a label of an edge. */
  const isShape = (cell: CellData) => {
    if (cell.kind !== 'vertex' || !cell.geometry || cell.geometry.relative) return false
    const parent = cell.parent ? byId.get(cell.parent) : undefined
    return cell.parent === LAYER_CELL_ID || (parent?.kind === 'vertex' && !parent.style.codrawShape)
  }

  const used = new Set<string>()
  const unique = (name: string, fallback: string) => {
    const base = identifier(name, fallback)
    let id = base
    for (let index = 2; used.has(id); index++) id = `${base}_${index}`
    used.add(id)
    return id
  }

  const elements = new Map<string, ArchElement>()
  const boundaries = new Map<string, ArchBoundary>()
  const boxes = new Map<string, Box>()
  let skipped = 0
  for (const cell of cells) {
    if (!isShape(cell)) continue
    const mapping = SHAPES[String(cell.style.codrawShape ?? '')]
    // A group of shapes is no shape of its own: its shapes count.
    if (!mapping) {
      if (cell.style.codrawShape || !cells.some((child) => child.parent === cell.id)) skipped += 1
      continue
    }
    const lines = labelLines(cell)
    const name = lines[0] ?? ''
    boxes.set(cell.id, boxOf(cell))
    if ('boundary' in mapping) {
      const type = C4_TYPE.exec(lines[1] ?? '')?.[1]?.trim().toLowerCase()
      const kind: BoundaryKind = mapping.boundary !== 'c4' ? mapping.boundary : type === 'container' ? 'container' : 'system'
      boundaries.set(cell.id, { type: 'boundary', id: unique(name, kind), kind, name, children: [] })
      continue
    }
    const c4 = String(cell.style.codrawShape).startsWith('c4-')
    const typed = c4 ? C4_TYPE.exec(lines[1] ?? '') : null
    elements.set(cell.id, {
      type: 'element',
      id: unique(name, mapping.kind),
      kind: mapping.kind,
      variant: mapping.variant ?? 'plain',
      external: mapping.external ?? false,
      name,
      technology: typed?.[2]?.trim() ?? '',
      description: lines.slice(typed ? 2 : 1).join(c4 ? ' ' : '; '),
    })
  }

  // Each element or frame lies in the smallest frame larger than it that holds its centre.
  const frames = [...boundaries.keys()].sort((a, b) => area(boxes.get(a)!) - area(boxes.get(b)!))
  const parentOf = (id: string) =>
    frames.find((frame) => frame !== id && area(boxes.get(frame)!) > area(boxes.get(id)!) && holds(boxes.get(frame)!, boxes.get(id)!)) ?? null
  const roots: ArchNode[] = []
  for (const cell of cells) {
    const node = elements.get(cell.id) ?? boundaries.get(cell.id)
    if (!node) continue
    const parent = parentOf(cell.id)
    ;(parent ? boundaries.get(parent)!.children : roots).push(node)
  }

  /** The element an end of an edge is on: the cell itself, or the nearest of its parents. */
  const elementAt = (id: string | null): [string, ArchElement] | null => {
    for (let cell = id ? byId.get(id) : undefined; cell; cell = cell.parent ? byId.get(cell.parent) : undefined) {
      const element = elements.get(cell.id)
      if (element) return [cell.id, element]
    }
    return null
  }
  const relations: ArchRelation[] = []
  for (const edge of cells) {
    if (edge.kind !== 'edge') continue
    const source = elementAt(edge.source)
    const target = elementAt(edge.target)
    if (!source || !target || source[1] === target[1]) continue
    const label = labelLines(edge).join('\n')
    const parts = RELATION.exec(label)
    relations.push({
      source: source[1],
      target: target[1],
      description: (parts ? parts[1]! : label).replace(/\s+/g, ' ').trim(),
      technology: parts?.[2]?.trim() ?? '',
    })
  }
  return { title, roots, relations, skipped }
}

/** Every element of the model, in the order of the page. */
export function modelElements(model: ArchModel): ArchElement[] {
  const walk = (nodes: ArchNode[]): ArchElement[] => nodes.flatMap((node) => (node.type === 'element' ? [node] : walk(node.children)))
  return walk(model.roots)
}

/** Every frame of the model. */
export function modelBoundaries(model: ArchModel): ArchBoundary[] {
  const walk = (nodes: ArchNode[]): ArchBoundary[] => nodes.flatMap((node) => (node.type === 'boundary' ? [node, ...walk(node.children)] : []))
  return walk(model.roots)
}

/** What the export takes from the page, for the summary of the window. */
export function architectureSummary(model: ArchModel): string {
  return (
    `Элементов: ${modelElements(model).length}, границ: ${modelBoundaries(model).length}, связей: ${model.relations.length}, ` +
    `пропущено фигур: ${model.skipped}`
  )
}
