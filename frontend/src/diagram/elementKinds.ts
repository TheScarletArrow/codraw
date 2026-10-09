import { ELEMENT_STYLE_KEYS, type StyleValue } from './model.ts'
import type { ShapeId } from './shapes.ts'

/**
 * Kinds and properties of elements of the architecture as data, without the shapes of the palette: what reads and
 * writes files and documents, e.g. `.drawio`, takes them without the editor.
 */

/** What an element is in C4. */
export type C4Kind = 'person' | 'system' | 'container' | 'component'

/** How an element is drawn in C4: a box, a cylinder of data or a pipe of messages. */
export type C4Variant = 'plain' | 'database' | 'queue'

/** What a kind of element is in C4. */
export interface KindInfo {
  c4: C4Kind
  variant: C4Variant
  external: boolean
}

const kind = (c4: C4Kind, variant: C4Variant = 'plain', external = false): KindInfo => ({ c4, variant, external })

/**
 * The kinds of elements: shapes of the palette that stand for an element of the architecture, each with the nearest
 * element of C4. Frames, text and shapes of other notations are none.
 */
export const ELEMENT_KINDS: Readonly<Partial<Record<ShapeId, KindInfo>>> = {
  'c4-person': kind('person'),
  'c4-system': kind('system'),
  'c4-container': kind('container'),
  'c4-component': kind('component'),
  'c4-database': kind('container', 'database'),
  'c4-external-system': kind('system', 'plain', true),
  service: kind('container'),
  database: kind('container', 'database'),
  queue: kind('container', 'queue'),
  cache: kind('container', 'database'),
  user: kind('person'),
  'external-system': kind('system', 'plain', true),
  'load-balancer': kind('container'),
  'api-gateway': kind('container'),
  cdn: kind('container'),
  server: kind('container'),
  container: kind('container'),
  firewall: kind('container'),
  dns: kind('container'),
  'object-storage': kind('container', 'database'),
  'search-index': kind('container', 'database'),
  'data-warehouse': kind('container', 'database'),
  'event-topic': kind('container', 'queue'),
  scheduler: kind('container'),
  function: kind('container'),
  browser: kind('container'),
  'mobile-app': kind('container'),
  'desktop-app': kind('container'),
  'iot-device': kind('container'),
  'uml-component': kind('component'),
}

/** Frames that hold elements: the boundary of C4, a system or a container, and frames of no kind of C4. */
export const FRAME_SHAPES: Readonly<Partial<Record<ShapeId, 'c4' | 'group'>>> = {
  'c4-boundary': 'c4',
  'c4-deployment-node': 'group',
  boundary: 'group',
  'kubernetes-cluster': 'group',
  'uml-package': 'group',
}

/** The names of the kinds of C4 in a label: `[Container: Kotlin]`. */
export const C4_TYPE_NAMES: Readonly<Record<C4Kind, string>> = {
  person: 'Person',
  system: 'Software System',
  container: 'Container',
  component: 'Component',
}

export const isElementKind = (value: unknown): value is ShapeId => typeof value === 'string' && Object.hasOwn(ELEMENT_KINDS, value)

/** Style key of an edge: whether it is a synchronous call or an asynchronous message; see {@link Interaction}. */
export const INTERACTION_KEY = 'codrawInteraction'

/** Style key of a cell that shows the technology of its element on the second line of a label that is not of C4. */
export const SHOW_TECHNOLOGY_KEY = 'codrawShowTechnology'

/** Style key of the technology: of the element of a shape, and of an edge, which keeps it in its own style. */
export const TECHNOLOGY_KEY = ELEMENT_STYLE_KEYS.technology

export type Interaction = 'sync' | 'async'

export const INTERACTION_LABELS: Readonly<Record<Interaction, string>> = { sync: 'Синхронная', async: 'Асинхронная' }

export const isInteraction = (value: unknown): value is Interaction => value === 'sync' || value === 'async'

/** The properties of an element of a shape. */
export interface ElementProperties {
  name: string
  /** A shape of the palette among {@link ELEMENT_KINDS}, or none. */
  kind: ShapeId | null
  technology: string
  description: string
  owner: string
  tags: string[]
}

/** The properties of an edge. */
export interface EdgeProperties {
  technology: string
  interaction: Interaction | null
}

/** How long properties may be; longer ones are cut. */
export const PROPERTY_LIMITS = { name: 200, technology: 200, owner: 200, description: 2000, tags: 20, tag: 50 } as const

/** A line of text: no line breaks, spaces at the ends dropped, at most `max` characters. */
export function propertyLine(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, max) : ''
}

/** A text of lines: spaces at the ends of the text dropped, at most `max` characters. */
function propertyText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : ''
}

/** Tags of a text or a list: words without spaces, split by spaces and commas, each once, as many as allowed. */
export function parseTags(value: unknown): string[] {
  const words = (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : typeof value === 'string' ? [value] : [])
    .flatMap((item) => item.split(/[\s,]+/))
    .map((tag) => tag.slice(0, PROPERTY_LIMITS.tag))
    .filter(Boolean)
  return [...new Set(words)].slice(0, PROPERTY_LIMITS.tags)
}

/** Properties as CoDraw keeps them, from values that may come from anywhere: another program, a file, a document. */
export function normalizeProperties(properties: Partial<Record<keyof ElementProperties, unknown>>): ElementProperties {
  return {
    name: propertyLine(properties.name, PROPERTY_LIMITS.name),
    kind: isElementKind(properties.kind) ? properties.kind : null,
    technology: propertyLine(properties.technology, PROPERTY_LIMITS.technology),
    description: propertyText(properties.description, PROPERTY_LIMITS.description),
    owner: propertyLine(properties.owner, PROPERTY_LIMITS.owner),
    tags: parseTags(properties.tags),
  }
}

export const sameProperties = (a: ElementProperties, b: ElementProperties) =>
  a.name === b.name &&
  a.kind === b.kind &&
  a.technology === b.technology &&
  a.description === b.description &&
  a.owner === b.owner &&
  a.tags.join(' ') === b.tags.join(' ')

/** The style keys of properties, `undefined` for those that are empty: written, they replace what the cell had. */
export function propertiesStyle(properties: ElementProperties): Record<string, StyleValue | undefined> {
  return {
    [ELEMENT_STYLE_KEYS.name]: properties.name || undefined,
    [ELEMENT_STYLE_KEYS.kind]: properties.kind ?? undefined,
    [ELEMENT_STYLE_KEYS.technology]: properties.technology || undefined,
    [ELEMENT_STYLE_KEYS.description]: properties.description || undefined,
    [ELEMENT_STYLE_KEYS.owner]: properties.owner || undefined,
    [ELEMENT_STYLE_KEYS.tags]: properties.tags.length > 0 ? [...properties.tags] : undefined,
  }
}

/** The properties of an edge, from its style. */
export function edgeProperties(style: Record<string, unknown>): EdgeProperties {
  const interaction = style[INTERACTION_KEY]
  return {
    technology: propertyLine(style[TECHNOLOGY_KEY], PROPERTY_LIMITS.technology),
    interaction: isInteraction(interaction) ? interaction : null,
  }
}

/** The style keys of the properties of an edge, `undefined` for those that are empty. */
export function edgePropertiesStyle(properties: EdgeProperties): Record<string, StyleValue | undefined> {
  return { [TECHNOLOGY_KEY]: properties.technology || undefined, [INTERACTION_KEY]: properties.interaction ?? undefined }
}

/** The kind of C4 that a type of a label of C4 names: `Container`, `Software System`, `Container Db`, … */
export function c4KindOfType(type: string): C4Kind | null {
  const words = type.toLowerCase().replace(/[\s_-]+/g, ' ').trim()
  if (words.includes('person') || words.includes('user')) return 'person'
  if (words.includes('component')) return 'component'
  if (words.includes('container') || words.includes('database') || words === 'db') return 'container'
  if (words.includes('system')) return 'system'
  return null
}

/**
 * The kind of an element whose label of C4 names `type`: `current` while it is of that kind of C4, otherwise the shape
 * of C4 of the type, a database or an external system as the type says; `current` for a type of no kind.
 */
export function kindOfC4Type(type: string, current: ShapeId | null): ShapeId | null {
  const c4 = c4KindOfType(type)
  if (c4 === null) return current
  const words = type.toLowerCase()
  const info = current === null ? undefined : ELEMENT_KINDS[current]
  if (info?.c4 === c4 && !(words.includes('external') && !info.external)) return current
  if (c4 === 'system') return words.includes('external') ? 'c4-external-system' : 'c4-system'
  if (c4 === 'container' && (words.includes('db') || words.includes('database'))) return 'c4-database'
  return `c4-${c4}` as ShapeId
}

/** The type of C4 that a label of C4 names for a kind, e.g. `Container` for a database; none for no kind. */
export function c4TypeName(kind: ShapeId | null): string | null {
  const info = kind === null ? undefined : ELEMENT_KINDS[kind]
  return info ? C4_TYPE_NAMES[info.c4] : null
}
