import { edgeProperties, INTERACTION_LABELS, isElementKind } from './elementKinds.ts'
import { canBeElement, elementProperties, kindLabel } from './elementProps.ts'
import { isFreehandStyle } from './freehand.ts'
import { modelMessages } from './model.messages.ts'
import { isSequenceStyle, sequencePartOf } from './sequence.ts'
import { isTableStyle, type ShapeStyle } from './shapes.ts'

/**
 * The filter of a page: what a participant shows of a large diagram by the properties of its elements and the kind of
 * its edges, without copies of the page and without changing the document. It is the participant's own and lives in the
 * address of the board, so a link opens the same slice. The rules are data, without maxGraph: the canvas, the hidden
 * editor of images, the minimap and the search follow the same ones.
 */

/** The kind of an edge as the filter tells it: of its properties, or none. */
export type FilterInteraction = 'sync' | 'async' | 'none'

export interface PageFilter {
  tags: string[]
  /** Kinds of elements: shapes of the palette. */
  kinds: string[]
  technologies: string[]
  owners: string[]
  interactions: FilterInteraction[]
  /** What does not match is not drawn rather than drawn pale. */
  hide: boolean
}

export const NO_FILTER: PageFilter = { tags: [], kinds: [], technologies: [], owners: [], interactions: [], hide: false }

/** The facets of a filter, which choose values. */
export type FilterFacet = 'tags' | 'kinds' | 'technologies' | 'owners' | 'interactions'

export const FILTER_FACETS: readonly FilterFacet[] = ['tags', 'kinds', 'technologies', 'owners', 'interactions']

/** The parameters of the address of a board that keep the filter: each value of a facet once, `hide=1`. */
export const FILTER_PARAMS: Readonly<Record<FilterFacet, string>> = {
  tags: 'tag',
  kinds: 'kind',
  technologies: 'tech',
  owners: 'owner',
  interactions: 'edge',
}

export const HIDE_PARAM = 'hide'

export const INTERACTION_CHOICES: Readonly<Record<FilterInteraction, string>> = {
  ...INTERACTION_LABELS,
  get none() {
    return modelMessages.notSpecified
  },
}

const isInteractionChoice = (value: string): value is FilterInteraction => Object.hasOwn(INTERACTION_CHOICES, value)

/** A filter chooses something: a facet has a value. Hiding alone shows everything. */
export const isFilterActive = (filter: PageFilter | null | undefined): filter is PageFilter =>
  !!filter && FILTER_FACETS.some((facet) => filter[facet].length > 0)

export const sameFilter = (a: PageFilter, b: PageFilter) =>
  a.hide === b.hide && FILTER_FACETS.every((facet) => a[facet].join('\n') === b[facet].join('\n'))

const unique = (values: readonly string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))]

/** The filter of an address: the values of its parameters, those of no kind or interaction left out. */
export function filterFromParams(params: URLSearchParams): PageFilter {
  return {
    tags: unique(params.getAll(FILTER_PARAMS.tags)),
    kinds: unique(params.getAll(FILTER_PARAMS.kinds)).filter(isElementKind),
    technologies: unique(params.getAll(FILTER_PARAMS.technologies)),
    owners: unique(params.getAll(FILTER_PARAMS.owners)),
    interactions: unique(params.getAll(FILTER_PARAMS.interactions)).filter(isInteractionChoice),
    hide: params.get(HIDE_PARAM) === '1',
  }
}

/**
 * Writes the filter into the parameters of an address in place of the one they had; hiding stays as a choice of the
 * participant also while nothing is chosen. No filter leaves none of them.
 */
export function writeFilterParams(params: URLSearchParams, filter: PageFilter) {
  for (const facet of FILTER_FACETS) {
    params.delete(FILTER_PARAMS[facet])
    for (const value of filter[facet]) params.append(FILTER_PARAMS[facet], value)
  }
  params.delete(HIDE_PARAM)
  if (filter.hide) params.set(HIDE_PARAM, '1')
}

/**
 * The parameters of the filter alone of an address, as text: equal for equal filters whatever the other parameters,
 * e.g. the page, so that a page keeps its filter object while they change.
 */
export function filterQuery(params: URLSearchParams): string {
  const own = new URLSearchParams()
  for (const name of [...Object.values(FILTER_PARAMS), HIDE_PARAM]) for (const value of params.getAll(name)) own.append(name, value)
  return own.toString()
}

/** A cell of a page as the filter reads it: from the document or from the model of the canvas. */
export interface FilterRecord {
  id: string
  kind: 'vertex' | 'edge'
  parent: string | null
  source: string | null
  target: string | null
  value: string
  style: Record<string, unknown>
}

/** What the filter reads of a page: its cells by id, which have children, the elements and the edges. */
interface PageIndex {
  byId: Map<string, FilterRecord>
  children: Map<string, FilterRecord[]>
  elements: FilterRecord[]
  edges: FilterRecord[]
}

function indexPage(records: readonly FilterRecord[]): PageIndex {
  const byId = new Map(records.map((record) => [record.id, record]))
  const children = new Map<string, FilterRecord[]>()
  for (const record of records) if (record.parent !== null) children.set(record.parent, [...(children.get(record.parent) ?? []), record])
  const isElement = (record: FilterRecord) => {
    if (record.kind !== 'vertex') return false
    const parent = record.parent === null ? undefined : byId.get(record.parent)
    const style = record.style
    if (parent && (parent.kind === 'edge' || isTableStyle(parent.style as ShapeStyle) || isSequenceStyle(parent.style))) return false
    if (isTableStyle(style as ShapeStyle) || isSequenceStyle(style) || sequencePartOf(style) !== null) return false
    // A group: a container without a fill and a border.
    if (children.has(record.id) && style.fillColor === 'none' && style.strokeColor === 'none') return false
    return canBeElement(style)
  }
  return {
    byId,
    children,
    elements: records.filter(isElement),
    edges: records.filter((record) => record.kind === 'edge' && !isFreehandStyle(record.style)),
  }
}

/** The values of the facets of elements that an element has. */
function elementValues(record: FilterRecord) {
  const properties = elementProperties(record.style, record.value)
  return {
    tags: properties.tags,
    kinds: properties.kind ? [properties.kind] : [],
    technologies: properties.technology ? [properties.technology] : [],
    owners: properties.owner ? [properties.owner] : [],
  }
}

const interactionOf = (record: FilterRecord): FilterInteraction => edgeProperties(record.style).interaction ?? 'none'

/** The element has, in every facet of elements with a choice, one of the chosen values. */
function elementMatches(record: FilterRecord, filter: PageFilter): boolean {
  const values = elementValues(record)
  return (['tags', 'kinds', 'technologies', 'owners'] as const).every(
    (facet) => filter[facet].length === 0 || values[facet].some((value) => filter[facet].includes(value)),
  )
}

/**
 * The cells of a page that do not match the filter: the elements without a chosen value of a facet with a choice, the
 * edges of another kind than the chosen ones or with an end among them, and with them the labels of such edges and what
 * such cells hold. Cells that are no elements nor edges, e.g. stickies, text, tables and lines drawn by hand, match.
 * Empty for a filter that chooses nothing.
 */
export function filteredOut(records: readonly FilterRecord[], filter: PageFilter): Set<string> {
  const out = new Set<string>()
  if (!isFilterActive(filter)) return out
  const page = indexPage(records)
  for (const element of page.elements) if (!elementMatches(element, filter)) out.add(element.id)
  for (const edge of page.edges) {
    const kind = filter.interactions.length === 0 || filter.interactions.includes(interactionOf(edge))
    const ends = !(edge.source !== null && out.has(edge.source)) && !(edge.target !== null && out.has(edge.target))
    if (!kind || !ends) out.add(edge.id)
  }
  // What a cell that does not match holds goes with it: the label of an edge, the shapes of a frame.
  const take = (id: string) => {
    for (const child of page.children.get(id) ?? []) {
      if (out.has(child.id)) continue
      out.add(child.id)
      take(child.id)
    }
  }
  for (const id of [...out]) take(id)
  return out
}

/** How many elements of the page match the filter, of how many. */
export function filterCounts(records: readonly FilterRecord[], filter: PageFilter): { matched: number; total: number } {
  const page = indexPage(records)
  const matched = isFilterActive(filter) ? page.elements.filter((element) => elementMatches(element, filter)).length : page.elements.length
  return { matched, total: page.elements.length }
}

/** A value a facet offers: what it is, how the window calls it, and how many elements or edges of the page have it. */
export interface FilterChoice {
  value: string
  label: string
  count: number
}

export type FilterChoices = Record<FilterFacet, FilterChoice[]>

const byLabel = (a: FilterChoice, b: FilterChoice) => a.label.localeCompare(b.label, 'ru') || (a.value < b.value ? -1 : 1)

/**
 * The values the facets offer: those of the elements and the edges of the page, each with how many have it, and those
 * the filter chose, also when the page has none of them, e.g. after the participant went to another page.
 */
export function filterChoices(records: readonly FilterRecord[], filter: PageFilter = NO_FILTER): FilterChoices {
  const page = indexPage(records)
  const counts: Record<FilterFacet, Map<string, number>> = {
    tags: new Map(),
    kinds: new Map(),
    technologies: new Map(),
    owners: new Map(),
    interactions: new Map(),
  }
  const count = (facet: FilterFacet, value: string) => counts[facet].set(value, (counts[facet].get(value) ?? 0) + 1)
  for (const element of page.elements) {
    const values = elementValues(element)
    for (const facet of ['tags', 'kinds', 'technologies', 'owners'] as const) values[facet].forEach((value) => count(facet, value))
  }
  for (const edge of page.edges) count('interactions', interactionOf(edge))
  const label = (facet: FilterFacet, value: string) =>
    facet === 'kinds' && isElementKind(value)
      ? kindLabel(value)
      : facet === 'interactions' && isInteractionChoice(value)
        ? INTERACTION_CHOICES[value]
        : value
  const choices = {} as FilterChoices
  for (const facet of FILTER_FACETS) {
    for (const value of filter[facet]) if (!counts[facet].has(value)) counts[facet].set(value, 0)
    const list = [...counts[facet]].map(([value, total]) => ({ value, label: label(facet, value), count: total }))
    // The kinds of edges keep their order: synchronous, asynchronous, none.
    choices[facet] =
      facet === 'interactions'
        ? list.sort((a, b) => Object.keys(INTERACTION_CHOICES).indexOf(a.value) - Object.keys(INTERACTION_CHOICES).indexOf(b.value))
        : list.sort(byLabel)
  }
  return choices
}
