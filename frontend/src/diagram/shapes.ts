import type { CellStyle } from '@maxgraph/core'

export type ShapeId = 'rectangle' | 'rounded' | 'ellipse' | 'rhombus' | 'text'

export interface ShapePreset {
  id: ShapeId
  label: string
  width: number
  height: number
  value: string
  style: CellStyle
}

/** Shapes of the palette. Style keys and names match draw.io, so they map to `.drawio` one to one. */
export const SHAPES: ShapePreset[] = [
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
]

export function findShape(id: string): ShapePreset | undefined {
  return SHAPES.find((shape) => shape.id === id)
}

/** MIME type for dragging a palette shape onto the canvas. */
export const SHAPE_DRAG_TYPE = 'application/x-codraw-shape'
