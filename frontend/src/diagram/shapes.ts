import type { CellStyle } from '@maxgraph/core'
import { STICKY_COLORS } from './colors.ts'
import { BROWSER_BAR_HEIGHT } from './extensions.ts'
import { SEQUENCE_PRESET, SEQUENCE_SHAPE } from './sequence.ts'

export type ShapeId =
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
  | 'c4-person'
  | 'c4-system'
  | 'c4-container'
  | 'c4-component'
  | 'c4-database'
  | 'c4-external-system'
  | 'c4-boundary'

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
export type ShapeGroup = 'basic' | 'elements' | 'tables' | 'flowchart' | 'bpmn' | 'system' | 'uml' | 'c4'

export interface ShapeSection {
  title: string
  group: ShapeGroup
  shapes: ShapePreset[]
}

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

/** Shapes of the palette by section. Style keys and shape names match draw.io, so they map to `.drawio` one to one. */
export const SHAPE_SECTIONS: ShapeSection[] = [
  {
    title: 'Основные',
    group: 'basic',
    shapes: [
      { id: 'rectangle', label: 'Прямоугольник', width: 120, height: 60, value: '', style: {} },
      { id: 'rounded', label: 'Скруглённый прямоугольник', width: 120, height: 60, value: '', style: { rounded: true } },
      {
        id: 'ellipse',
        label: 'Эллипс',
        width: 120,
        height: 80,
        value: '',
        style: { shape: 'ellipse', perimeter: 'ellipsePerimeter' },
      },
      {
        id: 'rhombus',
        label: 'Ромб',
        width: 120,
        height: 80,
        value: '',
        style: { shape: 'rhombus', perimeter: 'rhombusPerimeter' },
      },
      {
        id: 'triangle',
        label: 'Треугольник',
        width: 110,
        height: 90,
        value: '',
        style: { shape: 'codraw.triangle' },
      },
      {
        id: 'hexagon',
        label: 'Шестиугольник',
        width: 120,
        height: 80,
        value: '',
        style: { shape: 'hexagon', perimeter: 'hexagonPerimeter' },
      },
      {
        id: 'pentagon',
        label: 'Пятиугольник',
        width: 120,
        height: 90,
        value: '',
        style: { shape: 'codraw.pentagon' },
      },
      {
        id: 'star',
        label: 'Звезда',
        width: 110,
        height: 110,
        value: '',
        style: { shape: 'codraw.star' },
      },
      {
        id: 'text',
        label: 'Текст',
        width: 100,
        height: 30,
        value: 'Текст',
        // As in draw.io, the width of a text follows the text.
        style: { fillColor: 'none', strokeColor: 'none', autosize: true },
      },
      {
        id: 'sticky',
        label: 'Стикер',
        width: STICKY_SIZE,
        height: STICKY_SIZE,
        value: '',
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
      },
    ],
  },
  {
    title: 'База данных',
    group: 'tables',
    shapes: [
      {
        id: 'table',
        label: 'Таблица',
        width: 180,
        height: TABLE_HEADER_HEIGHT + TABLE_FIELD_HEIGHT,
        value: 'Таблица',
        style: { ...TABLE_STYLE, dbVendor: 'postgresql', autosize: true },
        children: [{ value: 'id uuid PK', height: TABLE_FIELD_HEIGHT, style: TABLE_FIELD_STYLE }],
      },
    ],
  },
  {
    title: 'Структуры',
    group: 'elements',
    shapes: [
      {
        id: 'grid-table',
        label: 'Сетка таблицы',
        width: 240,
        height: 150,
        value: 'Таблица',
        style: {
          shape: 'codraw.gridTable',
          gridRows: 4,
          gridColumns: 3,
          fontStyle: 1,
          verticalAlign: 'top',
          spacingTop: 8,
        },
      },
      {
        id: 'list',
        label: 'Список',
        width: 180,
        height: 110,
        value: '• Элемент\n• Элемент\n• Элемент',
        style: { whiteSpace: 'wrap', align: 'left', verticalAlign: 'top', spacing: 12, spacingTop: 10 },
      },
    ],
  },
  {
    title: 'Блок-схемы',
    group: 'flowchart',
    shapes: [
      { id: 'flow-process', label: 'Процесс', width: 140, height: 70, value: 'Процесс', style: {} },
      {
        id: 'flow-terminator',
        label: 'Терминатор',
        width: 140,
        height: 60,
        value: 'Старт / стоп',
        style: { rounded: true, arcSize: 50 },
      },
      {
        id: 'flow-decision',
        label: 'Условие',
        width: 130,
        height: 90,
        value: 'Условие?',
        style: { shape: 'rhombus', perimeter: 'rhombusPerimeter' },
      },
      {
        id: 'flow-data',
        label: 'Данные',
        width: 140,
        height: 70,
        value: 'Данные',
        style: { shape: 'parallelogram' },
      },
      {
        id: 'flow-document',
        label: 'Документ процесса',
        width: 120,
        height: 80,
        value: 'Документ',
        style: { shape: 'document' },
      },
      {
        id: 'flow-predefined-process',
        label: 'Подпроцесс',
        width: 150,
        height: 70,
        value: 'Подпроцесс',
        style: { shape: 'codraw.predefinedProcess' },
      },
    ],
  },
  {
    title: 'BPMN',
    group: 'bpmn',
    shapes: [
      {
        id: 'bpmn-task',
        label: 'Задача',
        width: 150,
        height: 80,
        value: 'Задача',
        style: { rounded: true, arcSize: 12 },
      },
      {
        id: 'bpmn-event',
        label: 'Событие',
        width: 54,
        height: 54,
        value: 'Событие',
        style: { shape: 'codraw.bpmnEvent', perimeter: 'ellipsePerimeter', ...captionBelow },
      },
      {
        id: 'bpmn-gateway',
        label: 'Шлюз',
        width: 70,
        height: 70,
        value: 'Шлюз',
        style: { shape: 'codraw.bpmnGateway', perimeter: 'rhombusPerimeter', ...captionBelow },
      },
      {
        id: 'bpmn-data-object',
        label: 'Объект данных',
        width: 90,
        height: 110,
        value: 'Данные',
        style: { shape: 'note', verticalLabelPosition: 'bottom', verticalAlign: 'top' },
      },
      {
        id: 'bpmn-pool',
        label: 'Пул / дорожки',
        width: 360,
        height: 180,
        value: 'Пул',
        style: { shape: 'codraw.bpmnPool', fillColor: 'none', pointerEvents: false, lanes: 3, align: 'left', spacingLeft: 8 },
      },
    ],
  },
  {
    title: 'Архитектура',
    group: 'system',
    shapes: [
      { id: 'service', label: 'Сервис', width: 120, height: 60, value: 'Сервис', style: { rounded: true } },
      { id: 'database', label: 'База данных', width: 100, height: 90, value: 'База данных', style: { shape: 'cylinder' } },
      {
        id: 'queue',
        label: 'Очередь',
        width: 140,
        height: 60,
        value: 'Очередь',
        style: { shape: 'cylinder', direction: 'south' },
      },
      { id: 'cache', label: 'Кэш', width: 90, height: 70, value: 'Кэш', style: { shape: 'cylinder' } },
      {
        id: 'user',
        label: 'Пользователь',
        width: 40,
        height: 60,
        value: 'Пользователь',
        style: { shape: 'actor', verticalLabelPosition: 'bottom', verticalAlign: 'top' },
      },
      { id: 'external-system', label: 'Внешняя система', width: 140, height: 90, value: 'Внешняя система', style: { shape: 'cloud' } },
      { id: 'document', label: 'Документ', width: 110, height: 80, value: 'Документ', style: { shape: 'document' } },
      { id: 'boundary', label: 'Граница', width: 360, height: 240, value: 'Граница', style: boundaryStyle('#1f2328') },
    ],
  },
  {
    title: 'Инфраструктура',
    group: 'system',
    shapes: [
      {
        id: 'load-balancer',
        label: 'Балансировщик нагрузки',
        // Plain-text captions do not wrap, so the shape is as wide as its caption.
        width: 180,
        height: 70,
        value: 'Балансировщик нагрузки',
        style: { shape: 'hexagon', perimeter: 'hexagonPerimeter' },
      },
      { id: 'api-gateway', label: 'API-шлюз', width: 120, height: 60, value: 'API-шлюз', style: { shape: 'process' } },
      {
        id: 'cdn',
        label: 'CDN',
        width: 100,
        height: 70,
        value: 'CDN',
        style: { shape: 'doubleEllipse', perimeter: 'ellipsePerimeter' },
      },
      { id: 'server', label: 'Сервер', width: 50, height: 70, value: 'Сервер', style: { shape: 'codraw.server', ...captionBelow } },
      { id: 'container', label: 'Контейнер', width: 110, height: 70, value: 'Контейнер', style: { shape: 'cube' } },
      {
        id: 'kubernetes-cluster',
        label: 'Кластер Kubernetes',
        width: 400,
        height: 260,
        value: 'Кластер Kubernetes',
        style: { ...boundaryStyle('#326ce5'), rounded: true, arcSize: 4, fontColor: '#326ce5' },
      },
      {
        id: 'firewall',
        label: 'Брандмауэр',
        width: 70,
        height: 50,
        value: 'Брандмауэр',
        style: { shape: 'codraw.firewall', ...captionBelow },
      },
      { id: 'dns', label: 'DNS', width: 90, height: 60, value: 'DNS', style: { shape: 'card' } },
    ],
  },
  {
    title: 'Данные и сообщения',
    group: 'system',
    shapes: [
      {
        id: 'object-storage',
        label: 'Хранилище объектов',
        width: 60,
        height: 64,
        value: 'Хранилище объектов',
        style: { shape: 'codraw.bucket', ...captionBelow },
      },
      {
        id: 'search-index',
        label: 'Поисковый индекс',
        width: 140,
        height: 70,
        value: 'Поисковый индекс',
        // The caption keeps clear of the lines along the top and the left side.
        style: { shape: 'internalStorage', spacingLeft: 10, spacingTop: 10 },
      },
      {
        id: 'data-warehouse',
        label: 'Хранилище данных',
        width: 130,
        height: 90,
        value: 'Хранилище данных',
        style: { shape: 'datastore', spacingTop: 20 },
      },
      {
        id: 'event-topic',
        label: 'Топик событий',
        width: 140,
        height: 36,
        value: 'Топик событий',
        style: { shape: 'codraw.topic', ...captionBelow },
      },
      {
        id: 'scheduler',
        label: 'Планировщик задач',
        width: 56,
        height: 56,
        value: 'Планировщик задач',
        style: { shape: 'codraw.clock', perimeter: 'ellipsePerimeter', ...captionBelow },
      },
      { id: 'function', label: 'Функция', width: 120, height: 60, value: 'Функция', style: { shape: 'parallelogram' } },
    ],
  },
  {
    title: 'Клиенты',
    group: 'system',
    shapes: [
      {
        id: 'browser',
        label: 'Веб-браузер',
        width: 140,
        height: 90,
        value: 'Веб-браузер',
        // The caption sits below the title bar of the window.
        style: { shape: 'codraw.browser', spacingTop: BROWSER_BAR_HEIGHT },
      },
      {
        id: 'mobile-app',
        label: 'Мобильное приложение',
        width: 44,
        height: 76,
        value: 'Мобильное приложение',
        style: { shape: 'codraw.mobile', ...captionBelow },
      },
      {
        id: 'desktop-app',
        label: 'Десктоп-приложение',
        width: 80,
        height: 64,
        value: 'Десктоп-приложение',
        style: { shape: 'codraw.desktop', ...captionBelow },
      },
      {
        id: 'iot-device',
        label: 'IoT-устройство',
        width: 60,
        height: 60,
        value: 'IoT-устройство',
        style: { shape: 'codraw.chip', ...captionBelow },
      },
    ],
  },
  {
    title: 'UML',
    group: 'uml',
    shapes: [
      {
        id: 'uml-component',
        label: 'Компонент',
        width: 140,
        height: 70,
        value: 'Компонент',
        style: { shape: 'component', spacingLeft: 10 },
      },
      {
        id: 'uml-interface',
        label: 'Интерфейс',
        width: 30,
        height: 30,
        value: 'Интерфейс',
        style: { shape: 'ellipse', perimeter: 'ellipsePerimeter', ...captionBelow },
      },
      {
        id: 'uml-package',
        label: 'Пакет',
        width: 140,
        height: 90,
        value: 'Пакет',
        // The caption sits in the body, under the tab.
        style: { shape: 'folder', spacingTop: 20 },
      },
      {
        id: 'uml-note',
        label: 'Заметка',
        width: 120,
        height: 80,
        value: 'Заметка',
        style: { shape: 'note', fillColor: '#fff2cc', strokeColor: '#d6b656' },
      },
      {
        id: SEQUENCE_PRESET,
        label: 'Диаграмма последовательности',
        // Its parts and their layout set its size; see `sequence.ts`.
        width: 320,
        height: 240,
        value: 'Сценарий',
        style: { shape: SEQUENCE_SHAPE },
      },
    ],
  },
  {
    title: 'C4',
    group: 'c4',
    shapes: [
      {
        id: 'c4-person',
        label: 'Person',
        width: 200,
        height: 180,
        value: 'Пользователь\n[Person]\nОписание',
        // The caption sits in the body, under the head.
        style: { shape: 'mxgraph.c4.person2', fillColor: '#08427B', strokeColor: '#073B6F', fontColor: '#ffffff', spacingTop: 70 },
      },
      {
        id: 'c4-system',
        label: 'Software System',
        width: 240,
        height: 120,
        value: 'Система\n[Software System]\nОписание',
        style: c4Style('#1168BD', '#0B4884'),
      },
      {
        id: 'c4-container',
        label: 'Container',
        width: 240,
        height: 120,
        value: 'Контейнер\n[Container: технология]\nОписание',
        style: c4Style('#438DD5', '#3C7FC0'),
      },
      {
        id: 'c4-component',
        label: 'Component',
        width: 240,
        height: 120,
        value: 'Компонент\n[Component: технология]\nОписание',
        style: c4Style('#85BBF0', '#78A8D8', '#000000'),
      },
      {
        id: 'c4-database',
        label: 'Database',
        width: 240,
        height: 120,
        value: 'База данных\n[Container: технология]\nОписание',
        style: { shape: 'cylinder', fillColor: '#438DD5', strokeColor: '#3C7FC0', fontColor: '#ffffff' },
      },
      {
        id: 'c4-external-system',
        label: 'External System',
        width: 240,
        height: 120,
        value: 'Внешняя система\n[Software System]\nОписание',
        style: c4Style('#999999', '#8A8A8A'),
      },
      {
        id: 'c4-boundary',
        label: 'Граница системы',
        width: 480,
        height: 320,
        value: 'Граница системы\n[Software System]',
        style: { ...boundaryStyle('#666666'), fontColor: '#333333' },
      },
    ],
  },
]

export const SHAPES: ShapePreset[] = SHAPE_SECTIONS.flatMap((section) => section.shapes)

export function findShape(id: string): ShapePreset | undefined {
  return SHAPES.find((shape) => shape.id === id)
}

/**
 * Frames, text, stickies and sequence diagrams: they belong to no group, so nothing is connected to them with the
 * arrows.
 */
export const UNGROUPED_SHAPES: ReadonlySet<ShapeId> = new Set<ShapeId>([
  'text',
  'sticky',
  'sequence',
  'boundary',
  'bpmn-pool',
  'kubernetes-cluster',
  'c4-boundary',
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
