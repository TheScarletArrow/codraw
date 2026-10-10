import type { CellStyle } from '@maxgraph/core'
import { STICKY_COLORS } from './colors.ts'
import { LEGEND_PRESET, LEGEND_SHAPE } from './legendKeys.ts'
import { SEQUENCE_PRESET, SEQUENCE_SHAPE } from './sequence.ts'
import { PROVIDER_SHAPES, type ProviderId } from './providers.ts'
import { type NamedShapeId, shapeMessages as m, type ShapeSectionKey } from './shapes.messages.ts'

export type ShapeId =
  | ProviderId
  | 'rectangle'
  | 'rounded'
  | 'ellipse'
  | 'rhombus'
  | 'triangle'
  | 'hexagon'
  | 'pentagon'
  | 'star'
  | 'text'
  | 'sticky'
  | 'grid-table'
  | 'list'
  | 'numbered-list'
  | 'table'
  | 'flow-process'
  | 'flow-terminator'
  | 'flow-decision'
  | 'flow-data'
  | 'flow-document'
  | 'flow-predefined-process'
  | 'bpmn-task'
  | 'bpmn-event'
  | 'bpmn-gateway'
  | 'bpmn-data-object'
  | 'bpmn-pool'
  | 'service'
  | 'database'
  | 'queue'
  | 'cache'
  | 'user'
  | 'external-system'
  | 'document'
  | 'boundary'
  | 'load-balancer'
  | 'api-gateway'
  | 'cdn'
  | 'server'
  | 'container'
  | 'kubernetes-cluster'
  | 'firewall'
  | 'dns'
  | 'object-storage'
  | 'search-index'
  | 'data-warehouse'
  | 'event-topic'
  | 'scheduler'
  | 'function'
  | 'browser'
  | 'mobile-app'
  | 'desktop-app'
  | 'iot-device'
  | 'uml-component'
  | 'uml-interface'
  | 'uml-package'
  | 'uml-note'
  | 'sequence'
  | 'uml-actor'
  | 'uml-use-case'
  | 'uml-system-boundary'
  | 'c4-person'
  | 'c4-system'
  | 'c4-container'
  | 'c4-component'
  | 'c4-database'
  | 'c4-external-system'
  | 'c4-boundary'
  | 'c4-deployment-node'
  | 'legend'

/**
 * maxGraph style with draw.io keys and values that maxGraph does not type: `childLayout`, and port constraints
 * written as in draw.io (`eastwest`), which maxGraph reads as well.
 */
export type ShapeStyle = Omit<CellStyle, 'portConstraint'> & {
  childLayout?: string
  portConstraint?: string
  /** The palette shape the cell was created from; see {@link markedStyle}. */
  codrawShape?: string
  /** The width follows the label; see `autoWidth.ts`. The key of draw.io, which writes it as 0 or 1. */
  autosize?: boolean | number | string
  /** The database of a table; see `sql/dbVendors.ts`. */
  dbVendor?: string
  /** The size of the text fits the shape; see {@link TEXT_FIT_KEY}. */
  autosizeText?: boolean | number | string
  /** Rows of a grid-like shape. */
  gridRows?: number | string
  /** Columns of a grid-like shape. */
  gridColumns?: number | string
  /** Horizontal lanes of a lane-like shape. */
  lanes?: number | string
  /** `false` keeps edges off the cell, as in draw.io. */
  connectable?: boolean
}

/** A cell created inside the shape, e.g. a field of a table. It spans the width of the shape. */
export interface ChildPreset {
  value: string
  height: number
  style: ShapeStyle
}

export interface ShapePreset {
  id: ShapeId
  label: string
  width: number
  height: number
  value: string
  style: ShapeStyle
  children?: ChildPreset[]
}

/** Notation of a shape: quick connect offers only shapes of the same notation. */
export type ShapeGroup = 'basic' | 'elements' | 'tables' | 'flowchart' | 'bpmn' | 'system' | 'uml' | 'usecase' | 'c4'

export interface ShapeSection {
  id: ShapeSectionKey
  /** The title in the language of the interface. */
  title: string
  group: ShapeGroup
  shapes: ShapePreset[]
}

/** Height of the title bar of `codraw.browser`; its caption sits below the bar. */
export const BROWSER_BAR_HEIGHT = 16

/** Height of the table header that holds the table name. */
export const TABLE_HEADER_HEIGHT = 30
export const TABLE_FIELD_HEIGHT = 26
/** Room above the first index of a table, for the line and the caption of the block of indexes. */
export const TABLE_INDEX_GAP = 20
/** Style key of a row of a table that is an index, not a field. draw.io keeps keys it does not know, so files keep it. */
export const TABLE_INDEX_KEY = 'codrawIndex'

/**
 * Style key of a text whose size fits the shape: the key of draw.io, which picks the size of the font that fits the
 * shape and writes it as the text size of the shape, as CoDraw does (see `stickies.ts`). draw.io writes it as 0 or 1.
 */
export const TEXT_FIT_KEY = 'autosizeText'

/** Width and height of a new sticky. */
export const STICKY_SIZE = 160
/** Size of the text of a new sticky, which fitting the text does not exceed. */
export const STICKY_FONT_SIZE = 20

/** Room under the text of a sticky, for the name of who wrote it; see `StickySignatures.tsx`. */
export const STICKY_SIGNATURE_ROOM = 14

/** A table of a database schema: a swimlane whose fields are stacked under the name, as in draw.io. */
export const TABLE_STYLE: ShapeStyle = {
  shape: 'swimlane',
  startSize: TABLE_HEADER_HEIGHT,
  childLayout: 'stackLayout',
  fontStyle: 1,
  fillColor: '#eef2f6',
  swimlaneFillColor: '#ffffff',
  foldable: false,
}

/** A field of a table: one line of text that stays in its table and connects on its left or right side. */
export const TABLE_FIELD_STYLE: ShapeStyle = {
  fillColor: 'none',
  strokeColor: 'none',
  align: 'left',
  verticalAlign: 'middle',
  spacingLeft: 8,
  spacingRight: 8,
  overflow: 'hidden',
  portConstraint: 'eastwest',
  movable: false,
  resizable: false,
  rotatable: false,
}

/** A frame with a caption in the top-left corner; clicks inside reach the shapes under it. */
const boundaryStyle = (strokeColor: string): ShapeStyle => ({
  fillColor: 'none',
  strokeColor,
  dashed: true,
  dashPattern: '8 4',
  align: 'left',
  verticalAlign: 'top',
  spacingLeft: 10,
  spacingTop: 6,
  pointerEvents: false,
})

/** Icon-like shapes are captioned under the shape, like «Пользователь». */
const captionBelow: ShapeStyle = { verticalLabelPosition: 'bottom', verticalAlign: 'top' }

const c4Style = (fillColor: string, strokeColor: string, fontColor = '#ffffff'): ShapeStyle => ({
  rounded: true,
  arcSize: 10,
  fillColor,
  strokeColor,
  fontColor,
})

/**
 * A shape of CoDraw whose name in the palette and text on the canvas are in the language of the interface at the moment
 * they are read: the palette shows the name, a new shape gets the text.
 */
function named(preset: Omit<ShapePreset, 'id' | 'label' | 'value'> & { id: NamedShapeId }): ShapePreset {
  const { id } = preset
  return Object.defineProperties({ ...preset } as ShapePreset, {
    label: { get: () => m.labels[id], enumerable: true },
    value: { get: () => (m.values as Partial<Record<NamedShapeId, string>>)[id] ?? '', enumerable: true },
  })
}

/**
 * A legend, in the sections of architecture and of C4: its items and their layout set its size, and its look but the
 * shape comes from the hooks of the canvas; see `legend.ts`. No edge goes to it, here and in draw.io.
 */
const LEGEND: ShapePreset = named({
  id: LEGEND_PRESET,
  width: 200,
  height: 80,
  style: { shape: LEGEND_SHAPE, connectable: false },
})

/** Shapes of the palette by section. Style keys and shape names match draw.io, so they map to `.drawio` one to one. */
export const SHAPE_SECTIONS: ShapeSection[] = [
  {
    id: 'basic',
    get title() {
      return m.sections.basic
    },
    group: 'basic',
    shapes: [
      named({ id: 'rectangle', width: 120, height: 60, style: {} }),
      named({ id: 'rounded', width: 120, height: 60, style: { rounded: true } }),
      named({
        id: 'ellipse',
        width: 120,
        height: 80,
        style: { shape: 'ellipse', perimeter: 'ellipsePerimeter' },
      }),
      named({
        id: 'rhombus',
        width: 120,
        height: 80,
        style: { shape: 'rhombus', perimeter: 'rhombusPerimeter' },
      }),
      named({
        id: 'triangle',
        width: 110,
        height: 90,
        style: { shape: 'codraw.triangle' },
      }),
      named({
        id: 'hexagon',
        width: 120,
        height: 80,
        style: { shape: 'hexagon', perimeter: 'hexagonPerimeter' },
      }),
      named({
        id: 'pentagon',
        width: 120,
        height: 90,
        style: { shape: 'codraw.pentagon' },
      }),
      named({
        id: 'star',
        width: 110,
        height: 110,
        style: { shape: 'codraw.star' },
      }),
      named({
        id: 'text',
        width: 100,
        height: 30,
        // As in draw.io, the width of a text follows the text.
        style: { fillColor: 'none', strokeColor: 'none', autosize: true },
      }),
      named({
        id: 'sticky',
        width: STICKY_SIZE,
        height: STICKY_SIZE,
        // The keys of the notes of draw.io whose text fits them: words wrap, and the size of the text fits the sticky.
        style: {
          fillColor: STICKY_COLORS[0].value,
          strokeColor: 'none',
          shadow: true,
          whiteSpace: 'wrap',
          [TEXT_FIT_KEY]: true,
          fontSize: STICKY_FONT_SIZE,
          spacingBottom: STICKY_SIGNATURE_ROOM,
        },
      }),
    ],
  },
  {
    id: 'database',
    get title() {
      return m.sections.database
    },
    group: 'tables',
    shapes: [
      named({
        id: 'table',
        width: 180,
        height: TABLE_HEADER_HEIGHT + TABLE_FIELD_HEIGHT,
        style: { ...TABLE_STYLE, dbVendor: 'postgresql', autosize: true },
        children: [{ value: 'id uuid PK', height: TABLE_FIELD_HEIGHT, style: TABLE_FIELD_STYLE }],
      }),
    ],
  },
  {
    id: 'structures',
    get title() {
      return m.sections.structures
    },
    group: 'elements',
    shapes: [
      named({
        id: 'grid-table',
        width: 240,
        height: 150,
        style: {
          shape: 'codraw.gridTable',
          gridRows: 4,
          gridColumns: 3,
          fontStyle: 1,
          verticalAlign: 'top',
          spacingTop: 8,
        },
      }),
      named({
        id: 'list',
        width: 180,
        height: 110,
        style: { whiteSpace: 'wrap', align: 'left', verticalAlign: 'top', spacing: 12, spacingTop: 10 },
      }),
      named({
        id: 'numbered-list',
        width: 180,
        height: 110,
        style: { whiteSpace: 'wrap', align: 'left', verticalAlign: 'top', spacing: 12, spacingTop: 10 },
      }),
    ],
  },
  {
    id: 'flowchart',
    get title() {
      return m.sections.flowchart
    },
    group: 'flowchart',
    shapes: [
      named({ id: 'flow-process', width: 140, height: 70, style: {} }),
      named({
        id: 'flow-terminator',
        width: 140,
        height: 60,
        style: { rounded: true, arcSize: 50 },
      }),
      named({
        id: 'flow-decision',
        width: 130,
        height: 90,
        style: { shape: 'rhombus', perimeter: 'rhombusPerimeter' },
      }),
      named({
        id: 'flow-data',
        width: 140,
        height: 70,
        style: { shape: 'parallelogram' },
      }),
      named({
        id: 'flow-document',
        width: 120,
        height: 80,
        style: { shape: 'document' },
      }),
      named({
        id: 'flow-predefined-process',
        width: 150,
        height: 70,
        style: { shape: 'codraw.predefinedProcess' },
      }),
    ],
  },
  {
    id: 'bpmn',
    get title() {
      return m.sections.bpmn
    },
    group: 'bpmn',
    shapes: [
      named({
        id: 'bpmn-task',
        width: 150,
        height: 80,
        style: { rounded: true, arcSize: 12 },
      }),
      named({
        id: 'bpmn-event',
        width: 54,
        height: 54,
        style: { shape: 'codraw.bpmnEvent', perimeter: 'ellipsePerimeter', ...captionBelow },
      }),
      named({
        id: 'bpmn-gateway',
        width: 70,
        height: 70,
        style: { shape: 'codraw.bpmnGateway', perimeter: 'rhombusPerimeter', ...captionBelow },
      }),
      named({
        id: 'bpmn-data-object',
        width: 90,
        height: 110,
        style: { shape: 'note', verticalLabelPosition: 'bottom', verticalAlign: 'top' },
      }),
      named({
        id: 'bpmn-pool',
        width: 360,
        height: 180,
        style: { shape: 'codraw.bpmnPool', fillColor: 'none', pointerEvents: false, lanes: 3, align: 'left', spacingLeft: 8 },
      }),
    ],
  },
  {
    id: 'architecture',
    get title() {
      return m.sections.architecture
    },
    group: 'system',
    shapes: [
      named({ id: 'service', width: 120, height: 60, style: { rounded: true } }),
      named({ id: 'database', width: 100, height: 90, style: { shape: 'cylinder' } }),
      named({
        id: 'queue',
        width: 140,
        height: 60,
        style: { shape: 'cylinder', direction: 'south' },
      }),
      named({ id: 'cache', width: 90, height: 70, style: { shape: 'cylinder' } }),
      named({
        id: 'user',
        width: 40,
        height: 60,
        style: { shape: 'actor', verticalLabelPosition: 'bottom', verticalAlign: 'top' },
      }),
      named({ id: 'external-system', width: 140, height: 90, style: { shape: 'cloud' } }),
      named({ id: 'document', width: 110, height: 80, style: { shape: 'document' } }),
      named({ id: 'boundary', width: 360, height: 240, style: boundaryStyle('#1f2328') }),
      LEGEND,
    ],
  },
  {
    id: 'infrastructure',
    get title() {
      return m.sections.infrastructure
    },
    group: 'system',
    shapes: [
      named({
        id: 'load-balancer',
        // Plain-text captions do not wrap, so the shape is as wide as its caption.
        width: 180,
        height: 70,
        style: { shape: 'hexagon', perimeter: 'hexagonPerimeter' },
      }),
      named({ id: 'api-gateway', width: 120, height: 60, style: { shape: 'process' } }),
      named({
        id: 'cdn',
        width: 100,
        height: 70,
        style: { shape: 'doubleEllipse', perimeter: 'ellipsePerimeter' },
      }),
      named({ id: 'server', width: 50, height: 70, style: { shape: 'codraw.server', ...captionBelow } }),
      named({ id: 'container', width: 110, height: 70, style: { shape: 'cube' } }),
      named({
        id: 'kubernetes-cluster',
        width: 400,
        height: 260,
        style: { ...boundaryStyle('#326ce5'), rounded: true, arcSize: 4, fontColor: '#326ce5' },
      }),
      named({
        id: 'firewall',
        width: 70,
        height: 50,
        style: { shape: 'codraw.firewall', ...captionBelow },
      }),
      named({ id: 'dns', width: 90, height: 60, style: { shape: 'card' } }),
    ],
  },
  {
    id: 'data',
    get title() {
      return m.sections.data
    },
    group: 'system',
    shapes: [
      named({
        id: 'object-storage',
        width: 60,
        height: 64,
        style: { shape: 'codraw.bucket', ...captionBelow },
      }),
      named({
        id: 'search-index',
        width: 140,
        height: 70,
        // The caption keeps clear of the lines along the top and the left side.
        style: { shape: 'internalStorage', spacingLeft: 10, spacingTop: 10 },
      }),
      named({
        id: 'data-warehouse',
        width: 130,
        height: 90,
        style: { shape: 'datastore', spacingTop: 20 },
      }),
      named({
        id: 'event-topic',
        width: 140,
        height: 36,
        style: { shape: 'codraw.topic', ...captionBelow },
      }),
      named({
        id: 'scheduler',
        width: 56,
        height: 56,
        style: { shape: 'codraw.clock', perimeter: 'ellipsePerimeter', ...captionBelow },
      }),
      named({ id: 'function', width: 120, height: 60, style: { shape: 'parallelogram' } }),
    ],
  },
  {
    id: 'clients',
    get title() {
      return m.sections.clients
    },
    group: 'system',
    shapes: [
      named({
        id: 'browser',
        width: 140,
        height: 90,
        // The caption sits below the title bar of the window.
        style: { shape: 'codraw.browser', spacingTop: BROWSER_BAR_HEIGHT },
      }),
      named({
        id: 'mobile-app',
        width: 44,
        height: 76,
        style: { shape: 'codraw.mobile', ...captionBelow },
      }),
      named({
        id: 'desktop-app',
        width: 80,
        height: 64,
        style: { shape: 'codraw.desktop', ...captionBelow },
      }),
      named({
        id: 'iot-device',
        width: 60,
        height: 60,
        style: { shape: 'codraw.chip', ...captionBelow },
      }),
    ],
  },
  {
    id: 'uml',
    get title() {
      return m.sections.uml
    },
    group: 'uml',
    shapes: [
      named({
        id: 'uml-component',
        width: 140,
        height: 70,
        style: { shape: 'component', spacingLeft: 10 },
      }),
      named({
        id: 'uml-interface',
        width: 30,
        height: 30,
        style: { shape: 'ellipse', perimeter: 'ellipsePerimeter', ...captionBelow },
      }),
      named({
        id: 'uml-package',
        width: 140,
        height: 90,
        // The caption sits in the body, under the tab.
        style: { shape: 'folder', spacingTop: 20 },
      }),
      named({
        id: 'uml-note',
        width: 120,
        height: 80,
        style: { shape: 'note', fillColor: '#fff2cc', strokeColor: '#d6b656' },
      }),
      named({
        id: SEQUENCE_PRESET,
        // Its parts and their layout set its size; see `sequence.ts`.
        width: 320,
        height: 240,
        style: { shape: SEQUENCE_SHAPE },
      }),
    ],
  },
  {
    id: 'useCases',
    get title() {
      return m.sections.useCases
    },
    group: 'usecase',
    shapes: [
      named({
        id: 'uml-actor',
        width: 30,
        height: 60,
        // The stick figure of draw.io, not the silhouette of «Пользователь»: UML draws actors this way.
        style: { shape: 'umlActor', ...captionBelow },
      }),
      named({
        id: 'uml-use-case',
        width: 160,
        height: 80,
        // The words of a long name wrap inside the ellipse instead of running out of it.
        style: { shape: 'ellipse', perimeter: 'ellipsePerimeter', whiteSpace: 'wrap' },
      }),
      named({
        id: 'uml-system-boundary',
        // Apart from the boundary of a system of C4: the palette, its search and the legend name each shape once.
        width: 320,
        height: 360,
        // The subject of UML: a frame of a solid line named at the top in the middle; clicks inside reach the shapes
        // under it, as with the other frames.
        style: { fillColor: 'none', verticalAlign: 'top', spacingTop: 6, pointerEvents: false },
      }),
    ],
  },
  {
    id: 'c4',
    get title() {
      return m.sections.c4
    },
    group: 'c4',
    shapes: [
      named({
        id: 'c4-person',
        width: 200,
        height: 180,
        // The caption sits in the body, under the head.
        style: { shape: 'mxgraph.c4.person2', fillColor: '#08427B', strokeColor: '#073B6F', fontColor: '#ffffff', spacingTop: 70 },
      }),
      named({
        id: 'c4-system',
        width: 240,
        height: 120,
        style: c4Style('#1168BD', '#0B4884'),
      }),
      named({
        id: 'c4-container',
        width: 240,
        height: 120,
        style: c4Style('#438DD5', '#3C7FC0'),
      }),
      named({
        id: 'c4-component',
        width: 240,
        height: 120,
        style: c4Style('#85BBF0', '#78A8D8', '#000000'),
      }),
      named({
        id: 'c4-database',
        width: 240,
        height: 120,
        style: { shape: 'cylinder', fillColor: '#438DD5', strokeColor: '#3C7FC0', fontColor: '#ffffff' },
      }),
      named({
        id: 'c4-external-system',
        width: 240,
        height: 120,
        style: c4Style('#999999', '#8A8A8A'),
      }),
      named({
        id: 'c4-boundary',
        width: 480,
        height: 320,
        style: { ...boundaryStyle('#666666'), fontColor: '#333333' },
      }),
      named({
        id: 'c4-deployment-node',
        width: 360,
        height: 240,
        // A frame of solid lines, as nodes of deployment are drawn in C4: what lies inside runs on the node.
        style: { ...boundaryStyle('#444444'), dashed: false, rounded: true, arcSize: 3, fontColor: '#333333' },
      }),
      LEGEND,
    ],
  },
  {
    id: 'providers',
    get title() {
      return m.sections.providers
    },
    group: 'system',
    shapes: PROVIDER_SHAPES,
  },
]

/** Shapes of the palette in their order; a shape of two sections, the legend, comes once, with the first. */
export const SHAPES: ShapePreset[] = SHAPE_SECTIONS.flatMap((section) => section.shapes).filter(
  (shape, index, all) => all.findIndex((other) => other.id === shape.id) === index,
)

export function findShape(id: string): ShapePreset | undefined {
  return SHAPES.find((shape) => shape.id === id)
}

/**
 * Frames, text, stickies, sequence diagrams and legends: they belong to no group, so nothing is connected to them with
 * the arrows.
 */
export const UNGROUPED_SHAPES: ReadonlySet<ShapeId> = new Set<ShapeId>([
  'text',
  'sticky',
  'sequence',
  'legend',
  'boundary',
  'bpmn-pool',
  'kubernetes-cluster',
  'c4-boundary',
  'c4-deployment-node',
  'uml-system-boundary',
])

const GROUPS = new Map<ShapeId, ShapeGroup>(
  SHAPE_SECTIONS.flatMap((section) =>
    section.shapes.filter((shape) => !UNGROUPED_SHAPES.has(shape.id)).map((shape) => [shape.id, section.group] as const),
  ),
)

export function shapeGroup(id: ShapeId): ShapeGroup | null {
  return GROUPS.get(id) ?? null
}

/** Shapes of a group in the order of the palette. */
export function groupShapes(group: ShapeGroup): ShapePreset[] {
  return SHAPES.filter((shape) => GROUPS.get(shape.id) === group)
}

/** Style of a new cell of the shape, marked with the shape so that its group is known for sure. */
export function markedStyle(shape: ShapePreset): ShapeStyle {
  return { ...shape.style, codrawShape: shape.id }
}

/**
 * The palette shape of a cell: by its mark, or, for cells without it (older boards, `.drawio` files), the first
 * grouped shape of the palette drawn the same way. Text, frames and unknown shapes have none.
 */
export function shapeOf(style: ShapeStyle): ShapePreset | null {
  const marked = style.codrawShape ? findShape(style.codrawShape) : undefined
  if (marked) return marked
  if (isTableStyle(style)) return findShape('table')!
  if (style.pointerEvents === false) return null
  const shape = String(style.shape ?? 'rectangle')
  if (shape === 'image') return PROVIDER_SHAPES.find((preset) => preset.style.image === style.image) ?? null
  if (shape === 'rectangle' && style.fillColor === 'none' && style.strokeColor === 'none') return null
  if (shape.startsWith('mxgraph.c4.')) return findShape('c4-person')!
  return (
    SHAPES.find(
      (preset) => GROUPS.has(preset.id) && !isTableStyle(preset.style) && (preset.style.shape ?? 'rectangle') === shape,
    ) ?? null
  )
}

export function shapeGroupOf(style: ShapeStyle): ShapeGroup | null {
  const shape = shapeOf(style)
  return shape ? shapeGroup(shape.id) : null
}

/** A flag of draw.io in any of its spellings: it writes 1, CoDraw keeps `true`. */
const isOn = (value: unknown) => value === true || value === 1 || value === '1'

/** The size of the text follows the shape (see {@link TEXT_FIT_KEY}), unless the width of the shape follows its text. */
export function hasTextFit(style: Record<string, unknown>): boolean {
  return isOn(style[TEXT_FIT_KEY]) && !isOn(style.autosize)
}

/**
 * A sticky: a shape made as one, or a shape whose text fits it, as the notes of draw.io that fit their text are; see
 * {@link TEXT_FIT_KEY}.
 */
export function isStickyStyle(style: Record<string, unknown> | null | undefined): boolean {
  return !!style && (style.codrawShape === 'sticky' || isOn(style[TEXT_FIT_KEY]))
}

/** A table is a cell whose children are stacked fields. */
export function isTableStyle(style: ShapeStyle | null | undefined): boolean {
  return style?.childLayout === 'stackLayout'
}

/** The style of a row of a table that is an index; for the cells of a page, e.g. those of an export. */
export function isTableIndexStyle(style: Record<string, unknown>): boolean {
  const value = style[TABLE_INDEX_KEY]
  return value === true || value === 1 || value === '1'
}

/** MIME type for dragging a palette shape onto the canvas. */
export const SHAPE_DRAG_TYPE = 'application/x-codraw-shape'
