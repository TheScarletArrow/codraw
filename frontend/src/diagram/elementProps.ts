import * as Y from 'yjs'
import {
  c4KindOfType,
  c4TypeName,
  isElementKind,
  kindOfC4Type,
  normalizeProperties,
  propertyLine,
  PROPERTY_LIMITS,
  SHOW_TECHNOLOGY_KEY,
  TECHNOLOGY_KEY,
  type ElementProperties,
} from './elementKinds.ts'
import { isImageStyle } from './images.ts'
import { ELEMENT_STYLE_KEYS, elementIdOf, getCells, getElements, getPages } from './model.ts'
import {
  findShape,
  isStickyStyle,
  isTableStyle,
  SHAPE_SECTIONS,
  shapeOf,
  type ShapeId,
  type ShapePreset,
  type ShapeStyle,
} from './shapes.ts'

/**
 * Properties of elements of the architecture: what an element is, its technology, description, owner and tags, apart
 * from the text of its label. A cell keeps them as style keys (see {@link ELEMENT_STYLE_KEYS}); a cell of an element
 * names it with `codrawElement`, and the document keeps them in the element. A shape whose properties nobody changed yet
 * has the properties its label tells, as the export of the architecture reads them.
 *
 * The label of a shape of C4 is made of the properties: the name, `[Type: technology]` and the description. Other
 * shapes have the name on their first line, the technology on the second as `[technology]` when the cell shows it,
 * and lines of their own after it, e.g. the endpoints of a service of OpenAPI.
 */

/** The kinds of elements by the sections of the palette, in its order, as a list of kinds offers them. */
export const KIND_SECTIONS: readonly { title: string; kinds: readonly ShapePreset[] }[] = SHAPE_SECTIONS.map((section) => ({
  title: section.title,
  kinds: section.shapes.filter((shape) => isElementKind(shape.id)),
})).filter((section) => section.kinds.length > 0)

/** The name of a kind as the palette calls it. */
export const kindLabel = (id: ShapeId) => findShape(id)?.label ?? id

/** The palette shape a cell is drawn as: by its mark, or as {@link shapeOf} finds it. */
export function shapeIdOf(style: Record<string, unknown>): ShapeId | null {
  return shapeOf(style as ShapeStyle)?.id ?? null
}

/**
 * A shape that may be an element: not a table, a sticky, a text, a list, a grid, a picture, nor a box without fill and
 * border, which is a text or a group. What holds a cell (an edge, a table) the editor tells.
 */
export function canBeElement(style: Record<string, unknown>): boolean {
  if (isTableStyle(style as ShapeStyle) || isStickyStyle(style) || isImageStyle(style)) return false
  if (['text', 'grid-table', 'list'].includes(String(style.codrawShape ?? ''))) return false
  return !(style.fillColor === 'none' && style.strokeColor === 'none')
}

export type LabelFormat = 'c4' | 'plain'

const isC4Shape = (id: string | null) => id !== null && id.startsWith('c4-')

/** The boundary of C4: its label has no description. */
export const isC4Boundary = (style: Record<string, unknown>) => shapeIdOf(style) === 'c4-boundary'

/** The label of a shape of C4, or of a shape whose element is of a kind of C4, is of C4; others are plain. */
export function labelFormat(style: Record<string, unknown>, kind: ShapeId | null): LabelFormat {
  return isC4Shape(shapeIdOf(style)) || isC4Shape(kind) ? 'c4' : 'plain'
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

/** A label of HTML, from draw.io, as text; a `<br>`, `<div>` or `<p>` is a new line. Plain text stays as it is. */
export function labelText(value: string, style: Record<string, unknown> = {}): string {
  if (!(style.html === true || style.html === 1 || style.html === '1' || /<(br|div|p|span|b|i)\b/i.test(value))) return value
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(div|p)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#39|[a-z]+);/gi, (entity, name: string) => ENTITIES[name.toLowerCase()] ?? entity)
}

/** The lines of a label that have text, without spaces at their ends. */
export function labelLines(value: string, style: Record<string, unknown> = {}): string[] {
  return labelText(value, style)
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

/** `[Container: Spring Boot]`: the type and the technology of the second line of a label of C4. */
const C4_TYPE = /^\[([^:\]]+)(?::\s*([^\]]*))?\]$/

/** `[Redis]`: the technology on the second line of a plain label. */
const BRACKETS = /^\[([^\]]*)\]$/

/** Words of the shapes of C4 of the palette that stand where the technology and the description go. */
const C4_PLACEHOLDERS = { technology: 'технология', description: 'Описание' }

/** A label as its parts. */
export interface ParsedLabel {
  name: string
  /** The type of C4 of the second line, as written. */
  c4Type: string | null
  technology: string
  /** The second line of a plain label is the technology in brackets. */
  technologyShown: boolean
  description: string
  /** Lines of a plain label after the name and the technology, as they are. */
  rest: string[]
}

/**
 * The parts of a label. Of C4: the name, `[Type: technology]` and the description, the words of the palette standing
 * for none. Plain: the name on the first line, `[technology]` on the second, and the other lines as they are.
 */
export function parseLabel(value: string, format: LabelFormat, style: Record<string, unknown> = {}): ParsedLabel {
  if (format === 'c4') {
    const lines = labelLines(value, style)
    const typed = C4_TYPE.exec(lines[1] ?? '')
    const technology = typed?.[2]?.trim() ?? ''
    const description = lines.slice(typed ? 2 : 1).join('\n')
    return {
      name: lines[0] ?? '',
      c4Type: typed ? typed[1]!.trim() : null,
      technology: technology === C4_PLACEHOLDERS.technology ? '' : technology,
      technologyShown: typed?.[2] !== undefined,
      description: description === C4_PLACEHOLDERS.description ? '' : description,
      rest: [],
    }
  }
  const lines = labelText(value, style).split('\n')
  const bracketed = BRACKETS.exec(lines[1]?.trim() ?? '')
  return {
    name: lines[0]?.trim() ?? '',
    c4Type: null,
    technology: bracketed ? bracketed[1]!.trim() : '',
    technologyShown: bracketed !== null,
    description: '',
    rest: lines.slice(bracketed ? 2 : 1),
  }
}

/** The kind a shape stands for when nobody chose one: its own shape, the boundary of C4 by the type of its label. */
export function defaultKind(style: Record<string, unknown>, value = ''): ShapeId | null {
  const shape = shapeIdOf(style)
  if (shape === 'c4-boundary') {
    const type = C4_TYPE.exec(labelLines(value, style)[1] ?? '')?.[1] ?? ''
    return c4KindOfType(type) === 'container' ? 'c4-container' : 'c4-system'
  }
  return isElementKind(shape) ? shape : null
}

/** The element of a cell has its properties of its own: somebody changed them, or a template or an import set them. */
export const hasElement = (style: Record<string, unknown>) => elementIdOf(style) !== null

const styleText = (style: Record<string, unknown>, key: string) => (typeof style[key] === 'string' ? (style[key] as string) : '')

/**
 * The properties of a shape: those of its element, or, for a shape without one, those that its label tells (see
 * {@link parseLabel}), with the kind of its shape.
 */
export function elementProperties(style: Record<string, unknown>, value: string): ElementProperties {
  if (hasElement(style)) {
    const kindValue = style[ELEMENT_STYLE_KEYS.kind]
    const format = labelFormat(style, isElementKind(kindValue) ? kindValue : null)
    return normalizeProperties({
      name: styleText(style, ELEMENT_STYLE_KEYS.name) || parseLabel(value, format, style).name,
      kind: kindValue,
      technology: style[ELEMENT_STYLE_KEYS.technology],
      description: style[ELEMENT_STYLE_KEYS.description],
      owner: style[ELEMENT_STYLE_KEYS.owner],
      tags: style[ELEMENT_STYLE_KEYS.tags],
    })
  }
  const shapeKind = defaultKind(style, value)
  const parsed = parseLabel(value, labelFormat(style, shapeKind), style)
  return normalizeProperties({
    name: parsed.name,
    kind: parsed.c4Type === null ? shapeKind : kindOfC4Type(parsed.c4Type, shapeKind),
    technology: parsed.technology,
    description: parsed.description,
  })
}

/** The cell shows the technology on the second line of its plain label; a label of C4 shows it its own way. */
export function showsTechnology(style: Record<string, unknown>, value: string): boolean {
  if (labelFormat(style, elementProperties(style, value).kind) === 'c4') return false
  if (hasElement(style)) return style[SHOW_TECHNOLOGY_KEY] === true || style[SHOW_TECHNOLOGY_KEY] === 1 || style[SHOW_TECHNOLOGY_KEY] === '1'
  return parseLabel(value, 'plain', style).technologyShown
}

/**
 * The label of a shape made of the properties of its element. Of C4: the name, `[Type: technology]` by the kind, or by
 * the kind of the shape without one, and the description, which the boundary does not show. Plain: the name, the
 * technology in brackets when `showTechnology`, and the lines `rest` of the label as they were.
 */
export function composeLabel(
  properties: ElementProperties,
  style: Record<string, unknown>,
  { showTechnology = false, rest = [] }: { showTechnology?: boolean; rest?: string[] } = {},
): string {
  const { name, technology, description } = properties
  if (labelFormat(style, properties.kind) === 'c4') {
    const type = c4TypeName(properties.kind ?? defaultKind(style))
    const second = type ? (technology ? `[${type}: ${technology}]` : `[${type}]`) : technology ? `[${technology}]` : null
    return [name, ...(second ? [second] : []), ...(description && !isC4Boundary(style) ? [description] : [])].join('\n')
  }
  return [name, ...(showTechnology && technology ? [`[${technology}]`] : []), ...rest].join('\n')
}

/**
 * The label of a shape after its properties become `properties`: of C4 made of them, plain with the lines of its own
 * of the label `value`.
 */
export function relabel(properties: ElementProperties, style: Record<string, unknown>, value: string, showTechnology: boolean): string {
  const before = labelFormat(style, elementProperties(style, value).kind)
  // A label that was of C4 has no lines of its own.
  const rest = before === 'plain' ? parseLabel(value, 'plain', style).rest : []
  return composeLabel(properties, style, { showTechnology, rest })
}

/**
 * The properties a label written on the canvas gives an element that had `current`: of C4 the name, the type, the
 * technology and the description (the boundary keeps its description); plain the name, and the technology with the
 * second line in brackets, which also tells whether it is shown.
 */
export function propertiesOfLabel(
  label: string,
  current: ElementProperties,
  style: Record<string, unknown>,
): { properties: ElementProperties; showTechnology: boolean } {
  if (labelFormat(style, current.kind) === 'c4') {
    const parsed = parseLabel(label, 'c4')
    const kind = parsed.c4Type === null ? current.kind : kindOfC4Type(parsed.c4Type, current.kind ?? defaultKind(style))
    const description = isC4Boundary(style) ? current.description : parsed.description
    return {
      properties: normalizeProperties({ ...current, name: parsed.name, kind, technology: parsed.technology, description }),
      showTechnology: false,
    }
  }
  const parsed = parseLabel(label, 'plain')
  const technology = parsed.technologyShown ? parsed.technology : current.technology
  return { properties: normalizeProperties({ ...current, name: parsed.name, technology }), showTechnology: parsed.technologyShown }
}

/**
 * Technologies of kinds of elements, as people write them. Searching the palette for one finds its shape (see
 * `shapeSearch.ts`); the panel of properties suggests them.
 */
export const TECHNOLOGIES: Readonly<Partial<Record<ShapeId, readonly string[]>>> = {
  service: ['Kotlin', 'Java', 'Spring Boot', 'Go', 'Node.js', 'Python', '.NET'],
  database: ['PostgreSQL', 'MySQL', 'Oracle', 'MongoDB', 'SQL Server', 'Cassandra'],
  queue: ['RabbitMQ', 'Amazon SQS', 'ActiveMQ', 'NATS'],
  cache: ['Redis', 'Memcached', 'Valkey'],
  'load-balancer': ['nginx', 'HAProxy', 'Envoy', 'Traefik'],
  'api-gateway': ['Kong', 'KrakenD', 'Spring Cloud Gateway'],
  cdn: ['Cloudflare', 'CloudFront', 'Akamai'],
  server: ['Linux', 'Windows Server', 'Amazon EC2'],
  container: ['Docker', 'Podman'],
  'kubernetes-cluster': ['Kubernetes', 'OpenShift'],
  firewall: ['WAF'],
  dns: ['Route 53', 'CoreDNS'],
  'object-storage': ['Amazon S3', 'MinIO', 'Google Cloud Storage'],
  'search-index': ['Elasticsearch', 'OpenSearch', 'Solr'],
  'data-warehouse': ['ClickHouse', 'BigQuery', 'Snowflake', 'Redshift'],
  'event-topic': ['Kafka', 'Pulsar', 'Kinesis'],
  scheduler: ['cron', 'Quartz', 'Airflow'],
  function: ['AWS Lambda', 'Cloud Functions'],
  browser: ['React', 'Angular', 'Vue', 'TypeScript'],
  'mobile-app': ['iOS', 'Android', 'Swift', 'Flutter'],
  'desktop-app': ['Electron', 'Qt', 'WPF'],
  'iot-device': ['MQTT', 'ESP32'],
}

/** The shapes of the palette whose technologies suggest those of the kinds of C4. */
const TECHNOLOGIES_OF_C4: Readonly<Partial<Record<ShapeId, ShapeId>>> = {
  'c4-container': 'service',
  'c4-component': 'service',
  'c4-database': 'database',
  'uml-component': 'service',
}

/** Technologies and protocols of edges, as people write them. */
export const EDGE_TECHNOLOGIES: readonly string[] = [
  'HTTPS',
  'HTTP',
  'REST/JSON',
  'gRPC',
  'GraphQL',
  'WebSocket',
  'Kafka',
  'AMQP',
  'MQTT',
  'JDBC',
  'SMTP',
]

/** Suggestions for the technology of an element of `kind`: those of the kind first, then those used on the board. */
export function technologySuggestions(kind: ShapeId | null, used: readonly string[]): string[] {
  const own = kind === null ? [] : (TECHNOLOGIES[kind] ?? TECHNOLOGIES[TECHNOLOGIES_OF_C4[kind] ?? kind] ?? [])
  return [...new Set([...own, ...used])]
}

/** What the elements and edges of a board name: their technologies and owners, sorted, each once. */
export function usedProperties(doc: Y.Doc): { technologies: string[]; owners: string[] } {
  const technologies = new Set<string>()
  const owners = new Set<string>()
  getElements(doc).forEach((element) => {
    if (!(element instanceof Y.Map)) return
    const technology = propertyLine(element.get('technology'), PROPERTY_LIMITS.technology)
    const owner = propertyLine(element.get('owner'), PROPERTY_LIMITS.owner)
    if (technology) technologies.add(technology)
    if (owner) owners.add(owner)
  })
  for (const pageId of getPages(doc).keys()) {
    getCells(doc, pageId).forEach((cell) => {
      if (!(cell instanceof Y.Map) || cell.get('kind') !== 'edge') return
      const style = cell.get('style')
      if (!(style instanceof Y.Map)) return
      const technology = propertyLine(style.get(TECHNOLOGY_KEY), PROPERTY_LIMITS.technology)
      if (technology) technologies.add(technology)
    })
  }
  const sorted = (values: Set<string>) => [...values].sort((a, b) => a.localeCompare(b, 'ru'))
  return { technologies: sorted(technologies), owners: sorted(owners) }
}
