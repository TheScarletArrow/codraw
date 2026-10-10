import { cellLabel } from '../comments/threads.ts'
import {
  cellOrigin,
  groupChanges,
  isSequencePart,
  isTableRow,
  type BoardDiff,
  type CellDiff,
  type CellSnapshot,
  type ChangeType,
  type PageDiff,
} from '../diagram/diff.ts'
import type { MergeConflicts } from '../diagram/merge.ts'
import type { Box, Point } from '../diagram/editor.ts'
import { EDGE_API_KEY } from '../diagram/edgeApi.ts'
import { INTERACTION_KEY, SHOW_TECHNOLOGY_KEY, type ElementProperties } from '../diagram/elementKinds.ts'
import { elementProperties } from '../diagram/elementProps.ts'
import { isFreehandStyle } from '../diagram/freehand.ts'
import { LINK_KEY } from '../diagram/links.ts'
import { LOCKED_BY_KEY, LOCKED_KEY } from '../diagram/locks.ts'
import { ELEMENT_KEY, ELEMENT_STYLE_KEYS, isElementStyleKey, type PointData } from '../diagram/model.ts'
import { isImageStyle } from '../diagram/images.ts'
import {
  ACTIVATE_KEY,
  ARROW_KEY,
  DEACTIVATE_KEY,
  FRAME_KEY,
  FROM_KEY,
  isSequenceStyle,
  NOTE_KEY,
  NUMBERS_KEY,
  PART_KEY,
  PARTICIPANT_KEY,
  PARTICIPANT_KIND_KEY,
  sequencePartOf,
  TO_KEY,
} from '../diagram/sequence.ts'
import { isTableIndexStyle, isTableStyle, shapeOf } from '../diagram/shapes.ts'
import { isElementStatus, STATUS_KEY, STATUS_KEYS, STATUS_LABELS } from '../diagram/status.ts'
import { changeMessages as m } from './changes.messages.ts'

/** A word for what changed in an element. */
type Word = Exclude<keyof typeof m.words, 'status'>

/** A change of an element as the list shows it. */
export interface ChangeItem {
  id: string
  type: ChangeType
  /** The label of the element as one short line, or its kind when it has none. */
  title: string
  /** What the element is: «Связь», «Линия от руки», «Таблица», «Поле», a shape of the palette, … */
  kind: string
  /** What changed in a changed element, in words, each once. */
  details: string[]
  /** The label a changed element had in the version, when its label changed. */
  previousTitle: string | null
  /** The number of elements added or removed together with this one, inside it. */
  nested: number
  /** The element, or one added or removed with it, changed elsewhere too, e.g. on the board since a proposal. */
  conflict: boolean
}

/** The cell as a change shows it: as the board has it now, or, for a removed cell, as the version had it. */
export const shownCell = (change: CellDiff): CellSnapshot => (change.type === 'removed' ? change.before : change.after)

/**
 * The changes of a page as items of the list, in the order of {@link groupChanges}; an item is in conflict when it or an
 * element nested in it is among the `conflicts` of the page.
 */
export function changeItems(page: PageDiff, conflicts: ReadonlySet<string> = new Set()): ChangeItem[] {
  const before = page.before ? new Kinds(page.before.cells) : null
  const after = page.after ? new Kinds(page.after.cells) : null
  return groupChanges(page).map(({ change, nested }) => {
    const cell = shownCell(change)
    const kinds = change.type === 'removed' ? before! : after!
    const kind = kinds.of(cell)
    const label = cellLabel(cell.value)
    const relabelled = change.type === 'changed' && change.changes.fields.includes('value')
    return {
      id: change.id,
      type: change.type,
      title: label || kind,
      kind,
      details: change.type === 'changed' ? changeDetails(change, kinds) : [],
      previousTitle: relabelled ? cellLabel(change.before.value) || null : null,
      nested: nested.length,
      conflict: conflicts.has(change.id) || nested.some((cell) => conflicts.has(cell.id)),
    }
  })
}

/** How many items of the list and pages are in conflict, as the list counts them. */
export function countConflicts(diff: BoardDiff, conflicts: MergeConflicts): number {
  return diff.pages.reduce(
    (count, page) =>
      count +
      Number(conflicts.pages.has(page.id)) +
      changeItems(page, conflicts.cells.get(page.id)).filter((item) => item.conflict).length,
    0,
  )
}

/** Kinds of the cells of one state of a page; groups are told by their children. */
class Kinds {
  private readonly cells: Map<string, CellSnapshot>
  private readonly parents: Set<string | null>

  constructor(cells: Map<string, CellSnapshot>) {
    this.cells = cells
    this.parents = new Set([...cells.values()].map((cell) => cell.parent))
  }

  /** A field or an index of a table of this state of the page. */
  isTableRow(cell: CellSnapshot): boolean {
    return isTableRow(cell, this.cells)
  }

  /** A part of a sequence diagram of this state of the page. */
  isSequencePart(cell: CellSnapshot): boolean {
    return isSequencePart(cell, this.cells)
  }

  of(cell: CellSnapshot): string {
    const kinds = m.kinds
    if (cell.kind === 'edge') return isFreehandStyle(cell.style) ? kinds.freehand : kinds.connector
    if (this.isTableRow(cell)) return isTableIndexStyle(cell.style) ? kinds.index : kinds.field
    if (isTableStyle(cell.style)) return kinds.table
    if (this.isSequencePart(cell)) return m.sequenceParts[sequencePartOf(cell.style)!]
    if (isSequenceStyle(cell.style)) return kinds.sequenceDiagram
    // A group of draw.io and CoDraw: a container without a fill and a border.
    if (this.parents.has(cell.id) && cell.style.fillColor === 'none' && cell.style.strokeColor === 'none') return kinds.group
    if (isImageStyle(cell.style)) return kinds.image
    return shapeOf(cell.style)?.label ?? kinds.shape
  }
}

/** Words for the style keys that CoDraw sets; other keys are the style. */
const STYLE_WORDS: Record<string, Word> = {
  image: 'image',
  fillColor: 'fill',
  gradientColor: 'fill',
  swimlaneFillColor: 'fill',
  strokeColor: 'lineColor',
  fontColor: 'textColor',
  strokeWidth: 'line',
  dashed: 'line',
  dashPattern: 'line',
  edgeStyle: 'connectorShape',
  curved: 'connectorShape',
  startArrow: 'markers',
  endArrow: 'markers',
  startFill: 'markers',
  endFill: 'markers',
  startSize: 'markers',
  endSize: 'markers',
  fontSize: 'textSize',
  fontFamily: 'font',
  fontStyle: 'fontStyle',
  align: 'textAlignment',
  verticalAlign: 'textAlignment',
  whiteSpace: 'textWrapping',
  autosize: 'autoWidth',
  shape: 'shape',
  codrawShape: 'shape',
  rounded: 'shape',
  arcSize: 'shape',
  dbVendor: 'dbms',
  codrawBase: 'baseTable',
  codrawBaseDefault: 'baseTable',
  codrawBaseTable: 'baseTable',
  codrawInherited: 'baseTable',
  codrawIndex: 'index',
  [LOCKED_KEY]: 'lock',
  [LOCKED_BY_KEY]: 'lock',
  [LINK_KEY]: 'link',
  [EDGE_API_KEY]: 'apiDescription',
  [SHOW_TECHNOLOGY_KEY]: 'technologyShown',
  // The properties of an edge; those of a shape are said by what changed in them (see {@link propertyWords}).
  [ELEMENT_STYLE_KEYS.technology]: 'technology',
  [INTERACTION_KEY]: 'interaction',
  [PART_KEY]: 'kind',
  [PARTICIPANT_KEY]: 'participant',
  [PARTICIPANT_KIND_KEY]: 'participantKind',
  [FROM_KEY]: 'participants',
  [TO_KEY]: 'participants',
  [ARROW_KEY]: 'messageKind',
  [ACTIVATE_KEY]: 'activation',
  [DEACTIVATE_KEY]: 'activation',
  [NOTE_KEY]: 'notePosition',
  [FRAME_KEY]: 'frameKind',
  [NUMBERS_KEY]: 'numbering',
}

/** Words for the properties of an element of a shape. */
const PROPERTY_WORDS: Readonly<Record<keyof ElementProperties, Word>> = {
  name: 'name',
  kind: 'type',
  technology: 'technology',
  description: 'description',
  owner: 'owner',
  tags: 'tags',
}

/**
 * The properties of a shape that differ between two states, those its label tells included: an element that keeps the
 * properties its label told changes none of them.
 */
function propertyWords(before: CellSnapshot, after: CellSnapshot): string[] {
  const earlier = elementProperties(before.style, before.value)
  const later = elementProperties(after.style, after.value)
  return (Object.keys(PROPERTY_WORDS) as (keyof ElementProperties)[])
    .filter((field) => JSON.stringify(earlier[field]) !== JSON.stringify(later[field]))
    .map((field) => m.words[PROPERTY_WORDS[field]])
}

const GEOMETRY_WORDS: Record<string, Word> = {
  x: 'position',
  y: 'position',
  relative: 'position',
  width: 'size',
  height: 'size',
  points: 'bends',
  offset: 'labelPosition',
  sourcePoint: 'start',
  targetPoint: 'end',
}

/**
 * What changed in a changed element, in words, each once, in the order of the fields, geometry, style, properties; a
 * status as the element has it now: «статус «Готово»» or «статус снят»; the properties of the element of a shape by
 * name: «технология», «владелец».
 */
function changeDetails(change: Extract<CellDiff, { type: 'changed' }>, kinds: Kinds): string[] {
  const { fields, geometry, style, attrs } = change.changes
  const cell = change.after
  const row = kinds.isTableRow(cell)
  const part = kinds.isSequencePart(cell)
  const status = cell.extra[STATUS_KEY]
  const fieldWord = (field: string): string => {
    // The status and the mark of who set it are one change, said by the status the element has now.
    if (STATUS_KEYS.includes(field)) return isElementStatus(status) ? m.words.status(STATUS_LABELS[status]) : m.words.statusRemoved
    return m.words[fieldWordOf(field)]
  }
  const fieldWordOf = (field: string): Word => {
    switch (field) {
      case 'value':
        return row || part ? 'text' : isTableStyle(cell.style) || isSequenceStyle(cell.style) ? 'title' : 'label'
      case 'parent':
        return row ? 'table' : part ? 'diagram' : 'group'
      case 'source':
        return 'start'
      case 'target':
        return 'end'
      case 'order':
        return 'order'
      case 'kind':
        return 'kind'
      default:
        return 'properties'
    }
  }
  // A line drawn by hand moves with its ends and bends together.
  const geometryWord = (key: string) => m.words[isFreehandStyle(cell.style) ? 'position' : (GEOMETRY_WORDS[key] ?? 'position')]
  // The properties of the element of a shape, and the element that keeps them, are said by what changed in them.
  const ofElement = (key: string) => cell.kind === 'vertex' && (key === ELEMENT_KEY || isElementStyleKey(key))
  const words = [
    ...fields.map(fieldWord),
    ...geometry.map(geometryWord),
    ...style.filter((key) => !ofElement(key)).map((key) => m.words[STYLE_WORDS[key] ?? 'style']),
    ...(style.some(ofElement) ? propertyWords(change.before, cell) : []),
    ...attrs.map(() => m.words.properties),
  ]
  return [...new Set(words)]
}

/**
 * Where a shape of a page stands, in the coordinates of the diagram: its geometry moved by the positions of the shapes
 * it is in. `null` for edges and for shapes placed relative to an edge, e.g. a label of an edge.
 */
export function absoluteBounds(cells: Map<string, CellSnapshot>, id: string): Box | null {
  const cell = cells.get(id)
  const geometry = cell?.geometry
  if (!cell || cell.kind !== 'vertex' || !geometry || geometry.relative) return null
  const origin = cellOrigin(cells, cell)
  return origin && { x: origin.x + geometry.x, y: origin.y + geometry.y, width: geometry.width, height: geometry.height }
}

/**
 * The line of an edge of a page, in the coordinates of the diagram: from its source through its bends to its target,
 * cut at the borders of its shapes. The route that the canvas computes is not stored, so the line is straight between
 * bends. `null` when an end is neither connected nor placed.
 */
export function edgeLine(cells: Map<string, CellSnapshot>, id: string): Point[] | null {
  const edge = cells.get(id)
  if (!edge || edge.kind !== 'edge') return null
  const origin = cellOrigin(cells, edge)
  if (!origin) return null
  const at = (point: PointData): Point => ({ x: origin.x + point.x, y: origin.y + point.y })
  const bends = (edge.geometry?.points ?? []).map(at)
  const source = edge.source === null ? null : absoluteBounds(cells, edge.source)
  const target = edge.target === null ? null : absoluteBounds(cells, edge.target)
  const loose = (point: PointData | undefined) => (point ? at(point) : null)
  const start = source ? center(source) : loose(edge.geometry?.sourcePoint)
  const end = target ? center(target) : loose(edge.geometry?.targetPoint)
  if (!start || !end) return null
  const first = source ? borderPoint(source, bends[0] ?? end) : start
  const last = target ? borderPoint(target, bends.at(-1) ?? start) : end
  return [first, ...bends, last]
}

const center = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })

/** Where the line from the middle of a box towards a point leaves the box; the middle when the point is inside. */
function borderPoint(box: Box, toward: Point): Point {
  const middle = center(box)
  const dx = toward.x - middle.x
  const dy = toward.y - middle.y
  const scale = Math.min(dx === 0 ? Infinity : box.width / 2 / Math.abs(dx), dy === 0 ? Infinity : box.height / 2 / Math.abs(dy))
  return scale >= 1 ? middle : { x: middle.x + dx * scale, y: middle.y + dy * scale }
}

/** The middle of a line by its length, e.g. for the mark of an edge. */
export function lineMiddle(points: Point[]): Point {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y))
  let rest = lengths.reduce((sum, length) => sum + length, 0) / 2
  for (const [index, length] of lengths.entries()) {
    if (rest <= length && length > 0) {
      const from = points[index]!
      const to = points[index + 1]!
      return { x: from.x + ((to.x - from.x) * rest) / length, y: from.y + ((to.y - from.y) * rest) / length }
    }
    rest -= length
  }
  return points[0]!
}

/** Where a removed element was in the version, in the coordinates of the diagram, to centre the canvas on it. */
export function ghostCenter(cells: Map<string, CellSnapshot>, id: string): Point | null {
  const bounds = absoluteBounds(cells, id)
  if (bounds) return center(bounds)
  const line = edgeLine(cells, id)
  return line && lineMiddle(line)
}
