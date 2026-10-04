import type { CellStyle } from '@maxgraph/core'

export type ShapeId =
  | 'rectangle'
  | 'rounded'
  | 'ellipse'
  | 'rhombus'
  | 'text'
  | 'table'
  | 'service'
  | 'database'
  | 'queue'
  | 'cache'
  | 'user'
  | 'external-system'
  | 'document'
  | 'boundary'
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
export type ShapeStyle = Omit<CellStyle, 'portConstraint'> & { childLayout?: string; portConstraint?: string }

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

export interface ShapeSection {
  title: string
  shapes: ShapePreset[]
}

/** Height of the table header that holds the table name. */
export const TABLE_HEADER_HEIGHT = 30
export const TABLE_FIELD_HEIGHT = 26

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
        id: 'text',
        label: 'Текст',
        width: 100,
        height: 30,
        value: 'Текст',
        style: { fillColor: 'none', strokeColor: 'none' },
      },
    ],
  },
  {
    title: 'База данных',
    shapes: [
      {
        id: 'table',
        label: 'Таблица',
        width: 180,
        height: TABLE_HEADER_HEIGHT + TABLE_FIELD_HEIGHT,
        value: 'Таблица',
        style: TABLE_STYLE,
        children: [{ value: 'id uuid PK', height: TABLE_FIELD_HEIGHT, style: TABLE_FIELD_STYLE }],
      },
    ],
  },
  {
    title: 'Архитектура',
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
    title: 'C4',
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

/** A table is a cell whose children are stacked fields. */
export function isTableStyle(style: ShapeStyle | null | undefined): boolean {
  return style?.childLayout === 'stackLayout'
}

/** MIME type for dragging a palette shape onto the canvas. */
export const SHAPE_DRAG_TYPE = 'application/x-codraw-shape'
