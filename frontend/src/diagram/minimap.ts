import { StyleDefaultsConfig, type AbstractGraph, type Cell, type CellState } from '@maxgraph/core'
import type { Box, Point } from './editor.ts'
import { rotatedBounds, rotationOf } from './rotation.ts'
import { isSequenceStyle } from './sequence.ts'
import { isTableStyle, type ShapeStyle } from './shapes.ts'

/** A shape of a {@link PageSketch}: its box in coordinates of the page and how it is painted. */
export interface SketchShape extends Box {
  /** The id of its cell. */
  id: string
  /** Clockwise around the centre, in degrees. */
  rotation: number
  ellipse: boolean
  /** The color of the fill, `null` without one; of a swimlane, e.g. a table, the color of its body. */
  fill: string | null
  /** The color of the border, `null` without one. */
  stroke: string | null
  /** The header of a swimlane, e.g. the name of a table: its height and color. */
  header: { height: number; fill: string | null } | null
}

/**
 * An edge of a {@link PageSketch}: the points of its line as drawn, in coordinates of the page. Its color is left out:
 * a thin line is seen on a minimap of either theme only in a color of the theme.
 */
export interface SketchEdge {
  /** The id of its cell. */
  id: string
  points: Point[]
}

/**
 * The page as the canvas draws it, simplified for a picture of the whole page: a box for every shape, a whole table
 * without its fields, a whole sequence diagram without its parts, the shapes of a group without the group, and the lines
 * of edges along their routes; no labels.
 */
export interface PageSketch {
  shapes: SketchShape[]
  edges: SketchEdge[]
  /** The box around everything drawn, `null` on an empty page. */
  bounds: Box | null
}

/** Colors as maxGraph and draw.io write them; anything else, e.g. `none` or a reference, paints nothing. */
const COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([0-9.,%\s/-]+\)|[a-z]+)$/i

/**
 * The color to paint with, `null` for none: a value of a document or of presence goes to an attribute of SVG only as a
 * color, never as a reference, e.g. `url(…)`.
 */
export function paintColor(value: unknown): string | null {
  return typeof value === 'string' && value !== 'none' && COLOR.test(value) ? value : null
}

/** The box around `box` and `other`. */
export function unionBox(box: Box | null, other: Box): Box {
  if (!box) return { ...other }
  const x = Math.min(box.x, other.x)
  const y = Math.min(box.y, other.y)
  return {
    x,
    y,
    width: Math.max(box.x + box.width, other.x + other.width) - x,
    height: Math.max(box.y + box.height, other.y + other.height) - y,
  }
}

/**
 * The sketch of the page that `graph` draws now, read from the states of its view: where the layout of tables, the
 * routes of edges and turned shapes put them, in coordinates of the page. Hidden cells and cells not drawn are left
 * out.
 */
export function sketchPage(graph: AbstractGraph): PageSketch {
  const view = graph.getView()
  const { scale, translate } = view
  const shapes: SketchShape[] = []
  const edges: SketchEdge[] = []
  let bounds: Box | null = null
  const toPage = (x: number, y: number): Point => ({ x: x / scale - translate.x, y: y / scale - translate.y })

  const addEdge = (state: CellState) => {
    const points = state.absolutePoints.flatMap((point) => (point ? [toPage(point.x, point.y)] : []))
    if (points.length < 2) return
    edges.push({ id: state.cell.getId()!, points })
    for (const point of points) bounds = unionBox(bounds, { ...point, width: 0, height: 0 })
  }
  const addShape = (cell: Cell, state: CellState) => {
    const style = state.style as ShapeStyle & typeof state.style
    const fill = paintColor(style.fillColor)
    const stroke = paintColor(style.strokeColor)
    // A container without a fill and a border, e.g. a group, is drawn by what it holds.
    if (!fill && !stroke && cell.getChildCount() > 0) return
    const { x, y } = toPage(state.x, state.y)
    const box = { x, y, width: state.width / scale, height: state.height / scale }
    const rotation = rotationOf(style)
    const swimlane = style.shape === 'swimlane'
    const startSize = Math.max(0, Number(style.startSize ?? StyleDefaultsConfig.startSize) || 0)
    const headerHeight = swimlane ? Math.min(box.height, startSize) : 0
    shapes.push({
      id: cell.getId()!,
      ...box,
      rotation,
      ellipse: style.shape === 'ellipse' || style.shape === 'doubleEllipse',
      fill: swimlane ? paintColor(style.swimlaneFillColor) : fill,
      stroke,
      header: headerHeight > 0 ? { height: headerHeight, fill } : null,
    })
    bounds = unionBox(bounds, rotatedBounds(box, rotation))
  }
  const visit = (parent: Cell) => {
    for (const cell of parent.getChildren()) {
      const state = view.getState(cell)
      if (!state) continue
      if (cell.isEdge()) {
        addEdge(state)
      } else if (cell.isVertex()) {
        addShape(cell, state)
        // A table draws its fields itself, and a sequence diagram its parts.
        if (!isTableStyle(cell.getStyle() as ShapeStyle) && !isSequenceStyle(cell.getStyle() as Record<string, unknown>)) visit(cell)
      }
    }
  }
  visit(graph.getDefaultParent())
  return { shapes, edges, bounds }
}

/** The size of the minimap in its own units: the picture is scaled to fit, keeping the proportions. */
export const MAP_WIDTH = 192
export const MAP_HEIGHT = 128

/** Room around what the minimap shows, in its units. */
const MAP_MARGIN = 6

/** How the minimap shows the page: a point of the page `p` is at `(p - origin) * scale + offset` of the minimap. */
export interface MapTransform {
  /** What the minimap shows, in coordinates of the page. */
  extent: Box
  scale: number
  offset: Point
}

/**
 * The transform that fits the drawing of the page and the visible area of the canvas into the minimap: wherever the
 * canvas is scrolled to, the minimap shows the visible area and the whole drawing.
 */
export function fitMap(drawing: Box | null, visible: Box): MapTransform {
  const extent = unionBox(drawing, visible)
  const width = Math.max(extent.width, 1)
  const height = Math.max(extent.height, 1)
  const scale = Math.min((MAP_WIDTH - 2 * MAP_MARGIN) / width, (MAP_HEIGHT - 2 * MAP_MARGIN) / height)
  return {
    extent,
    scale,
    offset: { x: (MAP_WIDTH - width * scale) / 2, y: (MAP_HEIGHT - height * scale) / 2 },
  }
}

/** A point of the page on the minimap. */
export function toMap({ extent, scale, offset }: MapTransform, point: Point): Point {
  return { x: (point.x - extent.x) * scale + offset.x, y: (point.y - extent.y) * scale + offset.y }
}

/** A point of the minimap on the page. */
export function fromMap({ extent, scale, offset }: MapTransform, point: Point): Point {
  return { x: (point.x - offset.x) / scale + extent.x, y: (point.y - offset.y) / scale + extent.y }
}

/** The point moved into the box, onto its nearest edge when it is outside. */
export function clampToBox(point: Point, box: Box): Point {
  return {
    x: Math.min(Math.max(point.x, box.x), box.x + box.width),
    y: Math.min(Math.max(point.y, box.y), box.y + box.height),
  }
}
