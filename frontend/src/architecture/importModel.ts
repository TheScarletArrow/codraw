import { C4_TYPE_NAMES, normalizeProperties, type C4Kind, type C4Variant, type ElementProperties } from '../diagram/elementKinds.ts'
import { composeLabel } from '../diagram/elementProps.ts'
import { findShape, markedStyle, type ShapeId } from '../diagram/shapes.ts'
import type { InfraEdge, InfraFrame, InfraGraph, InfraNode } from '../infra/infraGraph.ts'

/**
 * The model that an import of architecture as code builds from Structurizr DSL, C4-PlantUML and Mermaid C4, before it
 * becomes cells: elements of C4 and frames of no kind of C4 by their keys, each in the node it lies in, and the
 * relations between them. Several files make one model: an element declared again, in the same file or another, is the
 * same element (see {@link ArchitectureBuilder.element}).
 */

/** An error of the syntax of a file, which keeps the whole file from the model: `строка 3 — не закрыта кавычка`. */
export class ArchitectureSyntaxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArchitectureSyntaxError'
  }
}

/** Where a declaration is: the name of its file, or «Текст», and its line from 1. */
export interface Place {
  file: string
  line: number
}

export interface ImportedElement {
  type: 'element'
  /** What identifies the element in its source: an alias of C4 or an identifier of Structurizr. */
  key: string
  kind: C4Kind
  variant: C4Variant
  external: boolean
  name: string
  technology: string
  description: string
  tags: string[]
  /** An address of the web, or empty. */
  link: string
  /** The key of the node it lies in. */
  parent: string | null
  /** The files that declare it. */
  files: Set<string>
}

/** A frame of no kind of C4: a group, an enterprise, a boundary of no system, or a node of deployment. */
export interface ImportedGroup {
  type: 'group'
  key: string
  kind: 'group' | 'deployment'
  name: string
  technology: string
  description: string
  parent: string | null
  /** The files that declare it. */
  files: Set<string>
}

export type ImportedNode = ImportedElement | ImportedGroup

export interface ImportedRelation {
  source: string
  target: string
  description: string
  technology: string
}

/** What the files give: the elements and frames by their keys, in the order of declaration, and the relations drawn. */
export interface ImportedArchitecture {
  nodes: Map<string, ImportedNode>
  relations: ImportedRelation[]
  /** Relations to elements drawn as frames that relations of their parts already show: they are not drawn. */
  implied: ImportedRelation[]
  /** What was left out or kept apart, with the file and the line. */
  warnings: string[]
}

export interface ElementDeclaration {
  key: string
  kind: C4Kind
  variant?: C4Variant
  external?: boolean
  name?: string
  technology?: string
  description?: string
  tags?: string[]
  link?: string
  /** The key of the node it is declared in. */
  parent: string | null
}

export interface GroupDeclaration {
  key: string
  kind: 'group' | 'deployment'
  name: string
  technology?: string
  description?: string
  parent: string | null
}

export interface RelationDeclaration {
  /** The ends as the source names them. */
  source: string
  target: string
  description?: string
  technology?: string
  /**
   * The key that a reference names once every file is read: `null` for none, `undefined` for an element the source has
   * but the import leaves out, which needs no warning of its own.
   */
  resolve: (reference: string) => string | null | undefined
  place: Place
}

/** The most elements and frames added at once. */
export const MAX_ARCHITECTURE_NODES = 300

/** The most warnings the window lists. */
const MAX_WARNINGS = 30

/** The most relations an implied one names. */
const LISTED = 5

/** The widest shape of C4: its description wraps. */
const C4_MAX_WIDTH = 320

/** A name as names of elements are compared: without the case and the spaces around and between words. */
const comparable = (name: string) => name.replace(/\s+/g, ' ').trim().toLowerCase()

const unique = (values: string[]) => [...new Set(values.filter(Boolean))]

/** Two names of one element: equal, or one of them not given. */
const sameName = (a: string | undefined, b: string | undefined) => !comparable(a ?? '') || !comparable(b ?? '') || comparable(a!) === comparable(b!)

/** Builds the model as the parsers read their files; see {@link ImportedArchitecture}. */
export class ArchitectureBuilder {
  private readonly nodes = new Map<string, ImportedNode>()
  private readonly relations: RelationDeclaration[] = []
  private readonly warnings: string[] = []
  /** How many elements, frames and relations each file declares. */
  private readonly declared = new Map<string, number>()
  /** The keys of the declarations of each file, as the file writes them. */
  private readonly written = new Map<string, Set<string>>()

  /** How many elements, frames and relations a file declared. */
  declarations(file: string): number {
    return this.declared.get(file) ?? 0
  }

  private count(file: string) {
    this.declared.set(file, this.declarations(file) + 1)
  }

  /** Notes what was left out at a place. */
  warn(place: Place, message: string) {
    this.warnings.push(`${place.file}: строка ${place.line} — ${message}`)
  }

  /** The node of a key. */
  node(key: string): ImportedNode | undefined {
    return this.nodes.get(key)
  }

  /** The node `key` lies in `ancestor`, or is it. */
  within(key: string, ancestor: string): boolean {
    const seen = new Set<string>()
    for (let current: string | null = key; current !== null && !seen.has(current); current = this.nodes.get(current)?.parent ?? null) {
      if (current === ancestor) return true
      seen.add(current)
    }
    return false
  }

  /**
   * Declares an element and returns its key. A key the file declared already makes the same element, and so does a key
   * of another file with the same name, or of the same level of C4 and as external: its empty properties are filled, a
   * database or a queue refines a plain one, an external one stays external, tags join, and an element on the page gets
   * the node it is declared in; another level of C4 or another node is warned about, and the first stays. In another
   * file, an element of the same level, name and node is the same element too, whatever its key; a key of another file
   * for an element of no such likeness is another element, with a key of its own. `null` when the key names a frame of
   * no kind of C4.
   */
  element(declaration: ElementDeclaration, place: Place): string | null {
    const { key, existing } = this.identify(
      declaration,
      place,
      (named) => named.type === 'element' && named.kind === declaration.kind && named.external === (declaration.external ?? false),
      () => this.sameElement(declaration, place.file),
    )
    if (existing?.type === 'group') {
      this.warn(place, `${declaration.key} уже объявлен как граница: объявление пропущено`)
      return null
    }
    this.count(place.file)
    if (!existing) {
      this.nodes.set(key, {
        type: 'element',
        key,
        kind: declaration.kind,
        variant: declaration.variant ?? 'plain',
        external: declaration.external ?? false,
        name: declaration.name?.trim() ?? '',
        technology: declaration.technology?.trim() ?? '',
        description: declaration.description?.trim() ?? '',
        tags: unique(declaration.tags ?? []),
        link: declaration.link ?? '',
        parent: declaration.parent,
        files: new Set([place.file]),
      })
      return key
    }
    existing.files.add(place.file)
    if (existing.kind !== declaration.kind) {
      this.warn(place, `${declaration.key} уже объявлен как ${C4_TYPE_NAMES[existing.kind]}: оставлен первый`)
      return existing.key
    }
    existing.name ||= declaration.name?.trim() ?? ''
    existing.technology ||= declaration.technology?.trim() ?? ''
    existing.description ||= declaration.description?.trim() ?? ''
    if (existing.variant === 'plain' && declaration.variant) existing.variant = declaration.variant
    existing.external ||= declaration.external ?? false
    existing.tags = unique([...existing.tags, ...(declaration.tags ?? [])])
    existing.link ||= declaration.link ?? ''
    this.place(existing, declaration.parent, place)
    return existing.key
  }

  /** Fills the properties of a declared element, as a block of Structurizr does. */
  extend(key: string, properties: Partial<Pick<ImportedElement, 'technology' | 'description' | 'tags' | 'link'>>) {
    const element = this.nodes.get(key)
    if (element?.type !== 'element') return
    if (properties.technology !== undefined) element.technology = properties.technology.trim()
    if (properties.description !== undefined) element.description = properties.description.trim()
    if (properties.tags) {
      const read = readTags(properties.tags)
      if (read.variant && element.variant === 'plain') element.variant = read.variant
      element.external ||= read.external ?? false
      element.tags = unique([...element.tags, ...read.tags])
    }
    if (properties.link !== undefined) element.link = properties.link
  }

  /**
   * Declares a frame of no kind of C4 and returns its key; a frame of the same key is the same frame. `null` when the key
   * names an element.
   */
  group(declaration: GroupDeclaration, place: Place): string | null {
    const { key, existing } = this.identify(
      declaration,
      place,
      () => false,
      () => undefined,
    )
    if (existing?.type === 'element') {
      this.warn(place, `${declaration.key} уже объявлен как элемент: граница пропущена`)
      return null
    }
    this.count(place.file)
    if (existing) {
      existing.files.add(place.file)
      existing.technology ||= declaration.technology?.trim() ?? ''
      existing.description ||= declaration.description?.trim() ?? ''
      this.place(existing, declaration.parent, place)
      return existing.key
    }
    this.nodes.set(key, {
      type: 'group',
      key,
      kind: declaration.kind,
      name: declaration.name.trim(),
      technology: declaration.technology?.trim() ?? '',
      description: declaration.description?.trim() ?? '',
      parent: declaration.parent,
      files: new Set([place.file]),
    })
    return key
  }

  /** Declares a relation, whose ends are resolved once every file is read. */
  relation(declaration: RelationDeclaration) {
    this.count(declaration.place.file)
    this.relations.push(declaration)
  }

  /** The model of every file read. */
  build(): ImportedArchitecture {
    const relations: (ImportedRelation & { place: Place })[] = []
    const seen = new Set<string>()
    for (const declaration of this.relations) {
      const [source, target] = [declaration.resolve(declaration.source), declaration.resolve(declaration.target)]
      if (source === undefined || target === undefined) continue
      if (source === null || target === null) {
        this.warn(declaration.place, `связь пропущена: нет элемента ${source === null ? declaration.source : declaration.target}`)
        continue
      }
      if (source === target) continue
      if (this.within(source, target) || this.within(target, source)) {
        this.warn(declaration.place, `связь элемента с его частью не рисуется: ${declaration.source} → ${declaration.target}`)
        continue
      }
      const description = (declaration.description ?? '').replace(/\s+/g, ' ').trim()
      const technology = (declaration.technology ?? '').replace(/\s+/g, ' ').trim()
      const key = JSON.stringify([source, target, description, technology])
      if (seen.has(key)) continue
      seen.add(key)
      relations.push({ source, target, description, technology, place: declaration.place })
    }

    const parents = new Set([...this.nodes.values()].map((node) => node.parent))
    const framed = (key: string) => parents.has(key)
    const drawn: ImportedRelation[] = []
    const implied: ImportedRelation[] = []
    for (const relation of relations) {
      const { source, target, description, technology } = relation
      // A relation of an element shown as a frame that a relation of its parts shows already.
      const shown =
        (framed(source) || framed(target)) &&
        relations.some(
          (other) =>
            other !== relation &&
            (other.source !== source || other.target !== target) &&
            this.within(other.source, source) &&
            this.within(other.target, target),
        )
      ;(shown ? implied : drawn).push({ source, target, description, technology })
    }
    for (const node of this.nodes.values()) if (!node.name) node.name = node.key
    return { nodes: this.nodes, relations: drawn, implied, warnings: this.warnings }
  }

  /**
   * The node a declaration declares again and the key it has: the node of its key, when the file declared that key
   * already, or when the name is the same or the node is `alike`; else the node `same` finds; else none, with the key of
   * the declaration or, when another file gives that key to another node, a key of its own.
   */
  private identify(
    declaration: { key: string; name?: string },
    place: Place,
    alike: (named: ImportedNode) => boolean,
    same: () => ImportedNode | undefined,
  ): { key: string; existing: ImportedNode | undefined } {
    let written = this.written.get(place.file)
    if (!written) this.written.set(place.file, (written = new Set()))
    const mine = written.has(declaration.key)
    written.add(declaration.key)
    const named = this.nodes.get(declaration.key)
    if (named && (mine || sameName(named.name, declaration.name) || alike(named))) return { key: named.key, existing: named }
    const existing = same()
    if (existing || !named) return { key: existing?.key ?? declaration.key, existing }
    let key = declaration.key
    for (let index = 2; this.nodes.has(key); index++) key = `${declaration.key}_${index}`
    this.warn(place, `${declaration.key} в ${[...named.files][0]!} — другой элемент: здесь он назван иначе`)
    return { key, existing: undefined }
  }

  /** Puts a node declared again into the node it is declared in, when it lies in none. */
  private place(node: ImportedNode, parent: string | null, place: Place) {
    if (parent === null || parent === node.parent) return
    if (node.parent === null && !this.within(parent, node.key)) {
      node.parent = parent
      return
    }
    const current = node.parent === null ? undefined : this.nodes.get(node.parent)
    this.warn(place, `${node.key} уже лежит ${current ? `в «${current.name || current.key}»` : 'вне границ'}: оставлен там`)
  }

  /** An element of another file of the same level, name and node as the declaration. */
  private sameElement(declaration: ElementDeclaration, file: string): ImportedElement | undefined {
    const name = comparable(declaration.name ?? '')
    if (!name) return undefined
    for (const node of this.nodes.values()) {
      if (node.type !== 'element' || node.files.has(file)) continue
      if (node.kind === declaration.kind && comparable(node.name) === name && node.parent === declaration.parent) return node
    }
    return undefined
  }
}

/** Tags that say how an element is drawn. */
const VARIANT_TAGS: ReadonlySet<string> = new Set(['database', 'queue', 'external'])

/** Tags that Structurizr gives every element of a kind, which are no tags of a participant. */
const SERVICE_TAGS: ReadonlySet<string> = new Set([
  'element',
  'person',
  'software system',
  'container',
  'component',
  'group',
  'relationship',
  'deployment node',
  'infrastructure node',
  'container instance',
  'software system instance',
])

/** Refines how an element is drawn by a tag: `Database`, `Queue`, `External`. */
function refineByTag(element: Pick<ImportedElement, 'variant' | 'external'>, tag: string) {
  const word = tag.toLowerCase()
  if (word === 'database' && element.variant === 'plain') element.variant = 'database'
  if (word === 'queue' && element.variant === 'plain') element.variant = 'queue'
  if (word === 'external') element.external = true
}

/**
 * How tags of a source describe an element: the variant and whether it is external, by the tags of how it is drawn,
 * and the tags of a participant, without those and the tags Structurizr gives every element, words joined by `-`.
 */
export function readTags(tags: string[]): { variant?: C4Variant; external?: boolean; tags: string[] } {
  const element: Pick<ImportedElement, 'variant' | 'external'> = { variant: 'plain', external: false }
  const words = tags.map((tag) => tag.trim()).filter(Boolean)
  words.forEach((tag) => refineByTag(element, tag))
  return {
    ...(element.variant !== 'plain' && { variant: element.variant }),
    ...(element.external && { external: true }),
    tags: words.filter((tag) => !VARIANT_TAGS.has(tag.toLowerCase()) && !SERVICE_TAGS.has(tag.toLowerCase())).map((tag) => tag.replace(/[\s,]+/g, '-')),
  }
}

/** An address of the web that a link may lead to, or empty. */
export function webLink(value: string | undefined): string {
  if (!value) return ''
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

/** The shape of the palette of an element of C4. */
export function elementShape(element: Pick<ImportedElement, 'kind' | 'variant' | 'external'>): ShapeId {
  switch (element.kind) {
    case 'person':
      return 'c4-person'
    case 'system':
      return element.external ? 'c4-external-system' : 'c4-system'
    case 'container':
      return element.variant === 'database' ? 'c4-database' : element.variant === 'queue' ? 'queue' : 'c4-container'
    case 'component':
      return 'c4-component'
  }
}

/** The properties of the element of a shape or a boundary. */
function properties(element: ImportedElement, kind: ShapeId): ElementProperties {
  return normalizeProperties({ name: element.name, kind, technology: element.technology, description: element.description, tags: element.tags })
}

/** The label of a shape made of the properties of its element, as a participant who set them would see it. */
const label = (shape: ShapeId, element: ElementProperties, showTechnology = false) =>
  composeLabel(element, markedStyle(findShape(shape)!), { showTechnology })

/**
 * The graph of the model: an element with parts, and a frame of no kind of C4, is a frame — a system and a container a
 * boundary of C4 with the properties of the element, a group a «Граница», a node of deployment a «Узел развёртывания» —
 * with what lies in it inside; another element is a shape of C4 with the properties of its element. Every relation
 * drawn is a link labelled with its description and, on a line of its own, its technology.
 */
export function architectureGraph(model: ImportedArchitecture): InfraGraph {
  const children = new Map<string | null, ImportedNode[]>()
  for (const node of model.nodes.values()) {
    const parent = node.parent !== null && model.nodes.has(node.parent) ? node.parent : null
    children.set(parent, [...(children.get(parent) ?? []), node])
  }
  const frames: InfraFrame[] = []
  const nodes: InfraNode[] = []
  const indexes = new Map<string, { index: number; frame: boolean }>()

  const frameOf = (node: ImportedNode, parent: number | null): InfraFrame => {
    if (node.type === 'group') {
      return node.kind === 'deployment'
        ? { shape: 'c4-deployment-node', label: [node.name, ...(node.technology ? [`[${node.technology}]`] : [])].join('\n'), parent, key: node.key }
        : { shape: 'boundary', label: node.name, parent, key: node.key }
    }
    const element = properties(node, elementShape(node))
    return { shape: 'c4-boundary', label: label('c4-boundary', element), parent, key: node.key, element }
  }
  const nodeOf = (element: ImportedElement, frame: number | null): InfraNode => {
    const shape = elementShape(element)
    const showTechnology = shape === 'queue'
    const props = properties(element, shape)
    return {
      shape,
      lines: label(shape, props, showTechnology).split('\n'),
      frame,
      key: element.key,
      element: props,
      ...(showTechnology ? { showTechnology } : { maxWidth: C4_MAX_WIDTH }),
      ...(element.link && { link: element.link }),
    }
  }
  const visit = (node: ImportedNode, parent: number | null, path: Set<string>) => {
    const inside = children.get(node.key) ?? []
    if (node.type === 'group' || inside.length > 0) {
      const index = frames.push(frameOf(node, parent)) - 1
      indexes.set(node.key, { index, frame: true })
      const next = new Set(path).add(node.key)
      for (const child of inside) if (!next.has(child.key)) visit(child, index, next)
    } else {
      indexes.set(node.key, { index: nodes.push(nodeOf(node, parent)) - 1, frame: false })
    }
  }
  for (const root of children.get(null) ?? []) visit(root, null, new Set())

  const edges: InfraEdge[] = []
  for (const relation of model.relations) {
    const source = indexes.get(relation.source)
    const target = indexes.get(relation.target)
    if (!source || !target) continue
    edges.push({
      source: source.index,
      target: target.index,
      ...(source.frame && { sourceFrame: true }),
      ...(target.frame && { targetFrame: true }),
      label: [relation.description, ...(relation.technology ? [`[${relation.technology}]`] : [])].filter(Boolean).join('\n'),
      ...(relation.technology && { technology: relation.technology }),
    })
  }
  return { nodes, frames, edges }
}

/** What the import adds, for the summary before it, in the words of the summary of the export. */
export function architectureImportSummary(graph: InfraGraph): string {
  return `Элементов: ${graph.nodes.length}, границ: ${graph.frames.length}, связей: ${graph.edges.length}`
}

/** Why the graph is too large to add, or `null`. */
export function architectureGraphError(graph: InfraGraph): string | null {
  const count = graph.nodes.length + graph.frames.length
  return count > MAX_ARCHITECTURE_NODES
    ? `Слишком много элементов и границ: ${count}, за раз можно добавить не больше ${MAX_ARCHITECTURE_NODES}`
    : null
}

const listed = (items: string[]) => (items.length > LISTED ? `${items.slice(0, LISTED).join(', ')} и ещё ${items.length - LISTED}` : items.join(', '))

/** What the participant should know before adding: what was left out, and the relations that are not drawn. */
export function architectureWarnings(model: ImportedArchitecture): string[] {
  const warnings = [...model.warnings]
  if (model.implied.length > 0) {
    const relations = model.implied.map((relation) => `${relation.source} → ${relation.target}`)
    warnings.push(`Связей с раскрытыми элементами не нарисовано: ${model.implied.length} — их показывают связи частей: ${listed(relations)}`)
  }
  return warnings.length > MAX_WARNINGS ? [...warnings.slice(0, MAX_WARNINGS), `…и ещё ${warnings.length - MAX_WARNINGS}`] : warnings
}
