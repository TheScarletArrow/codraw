import type { Cell } from '@maxgraph/core'
import { blocksPlacement, type Side } from '../quickConnect.ts'
import { rotatedBounds, rotationOf } from '../rotation.ts'
import { isTableStyle, type ShapeStyle } from '../shapes.ts'

export interface RoutingBox {
  x: number
  y: number
  width: number
  height: number
}

/** A shape that edges go around, in absolute coordinates of the page. */
export interface RoutingShape extends RoutingBox {
  id: string
}

/** A point on the border of a shape where an edge may start or end, and the side it leaves the shape on. */
export interface RoutingPin {
  x: number
  y: number
  side: Side
}

export interface RoutingEnd {
  /** The shape the end is on: the shape itself, or the table of a field. */
  shape: string
  /** The cell the edge is connected to, e.g. the field of a table. */
  cell: string
  /** Points the router chooses from. */
  pins: RoutingPin[]
}

export interface RoutingConnector {
  /** The id of the edge. */
  id: string
  source: RoutingEnd
  target: RoutingEnd
}

/** What the router routes: the shapes of a page and its edges that are routed automatically. */
export interface RoutingInput {
  shapes: RoutingShape[]
  connectors: RoutingConnector[]
}

const isTable = (cell: Cell | null): boolean => cell?.isVertex() === true && isTableStyle(cell.getStyle() as ShapeStyle)

/** Bounds of a vertex in absolute coordinates of the page; `null` for a cell without a box of its own. */
export function absoluteBox(cell: Cell): RoutingBox | null {
  const geometry = cell.getGeometry()
  if (!geometry || geometry.relative) return null
  let { x, y } = geometry
  for (let parent = cell.getParent(); parent; parent = parent.getParent()) {
    const offset = parent.getGeometry()
    if (offset && !offset.relative) {
      x += offset.x
      y += offset.y
    }
  }
  return { x, y, width: geometry.width, height: geometry.height }
}

/** The side of a box that a point is closest to. */
function nearestSide(box: RoutingBox, x: number, y: number): Side {
  const distances: [Side, number][] = [
    ['left', Math.abs(x - box.x)],
    ['right', Math.abs(box.x + box.width - x)],
    ['top', Math.abs(y - box.y)],
    ['bottom', Math.abs(box.y + box.height - y)],
  ]
  return distances.reduce((nearest, side) => (side[1] < nearest[1] ? side : nearest))[0]
}

const number = (value: unknown) => (typeof value === 'number' ? value : typeof value === 'string' && value !== '' ? Number(value) : NaN)

/**
 * A number rounded to hundredths: turned points and boxes are the same for every participant even if the browsers
 * compute sines and cosines a little differently.
 */
const hundredths = (value: number) => Math.round(value * 100) / 100

/** The box around a shape turned by `rotation` degrees, which edges go around; the box itself when it is not turned. */
function turnedBox(box: RoutingBox, rotation: number): RoutingBox {
  if (rotation === 0) return box
  const { x, y, width, height } = rotatedBounds(box, rotation)
  return { x: hundredths(x), y: hundredths(y), width: hundredths(width), height: hundredths(height) }
}

/** Outward directions of the sides of a box. */
const NORMALS: Record<Side, [number, number]> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }

/**
 * A pin on the side of `box` as it is when the shape is turned by `rotation` degrees around its centre: the point turns
 * with the shape, and the edge leaves it in the direction nearest to the turned outward direction of its side, which
 * takes the edge away from the shape.
 */
function turnedPin(pin: RoutingPin, box: RoutingBox, rotation: number): RoutingPin {
  if (rotation === 0) return pin
  const radians = (rotation * Math.PI) / 180
  const [cos, sin] = [Math.cos(radians), Math.sin(radians)]
  const [centerX, centerY] = [box.x + box.width / 2, box.y + box.height / 2]
  const [dx, dy] = [pin.x - centerX, pin.y - centerY]
  const [normalX, normalY] = NORMALS[pin.side]
  const [outX, outY] = [normalX * cos - normalY * sin, normalX * sin + normalY * cos]
  const side: Side = Math.abs(outX) > Math.abs(outY) ? (outX > 0 ? 'right' : 'left') : outY > 0 ? 'bottom' : 'top'
  return { x: hundredths(centerX + dx * cos - dy * sin), y: hundredths(centerY + dx * sin + dy * cos), side }
}

/**
 * An edge is routed automatically when it is orthogonal, the shape of a new edge, and has no bends that the participant
 * placed.
 */
function isRouted(edge: Cell): boolean {
  const style = edge.getStyle() as Record<string, unknown>
  if (style.curved === true || style.curved === 1 || style.curved === '1') return false
  if (style.edgeStyle !== undefined && style.edgeStyle !== 'orthogonalEdgeStyle') return false
  return !edge.getGeometry()?.points?.length
}

/**
 * The shapes of a page (the root of its model, or a layer) that edges go around and its edges that are routed
 * automatically, in the order of their ids, so that every participant routes the same; a layer hidden on the canvas has
 * neither. Shapes are the tables as a whole and the other shapes; frames, which let
 * clicks through, and containers of shapes, e.g. groups, are not in the way, their shapes are. An end at a field of
 * a table may leave the table on its left or right border at the middle of the field; an end that the participant
 * fixed to a point of a shape leaves it there; another end leaves its shape at the middle of a side. A turned shape is
 * in the way with the box around it, and its pins turn with it, so that edges end at its turned border; the edges of a
 * turned table, which only a file of draw.io makes, are left to maxGraph.
 */
export function routingInput(page: Cell): RoutingInput {
  const shapes = new Map<Cell, RoutingShape>()
  const edges: Cell[] = []
  const visit = (parent: Cell) => {
    for (const cell of parent.getChildren()) {
      if (!cell.isVertex() && !cell.isEdge()) {
        // A layer of the root: the shapes of a layer hidden on the canvas are not in the way, and its edges are not drawn.
        if (cell.isVisible()) visit(cell)
      } else if (cell.isEdge()) {
        edges.push(cell)
      } else if (cell.isVertex()) {
        const style = cell.getStyle() as ShapeStyle
        const box = absoluteBox(cell)
        if (isTable(cell) || (!cell.getChildren().some((child) => child.isVertex()) && blocksPlacement(style))) {
          if (box && box.width > 0 && box.height > 0) {
            shapes.set(cell, { id: cell.getId()!, ...turnedBox(box, rotationOf(style)) })
          }
        } else {
          visit(cell)
        }
      }
    }
  }
  visit(page)

  const endOf = (edge: Cell, source: boolean): RoutingEnd | null => {
    const terminal = edge.getTerminal(source)
    if (!terminal?.isVertex()) return null
    const field = isTable(terminal.getParent()) ? terminal : null
    const owner = field ? terminal.getParent()! : terminal
    const shape = shapes.get(owner)
    const box = absoluteBox(terminal)
    const rotation = rotationOf(owner.getStyle())
    if (!shape || !box || (field && rotation !== 0)) return null
    const end = { shape: shape.id, cell: terminal.getId()! }
    const style = edge.getStyle() as Record<string, unknown>
    const [fixedX, fixedY] = source ? [number(style.exitX), number(style.exitY)] : [number(style.entryX), number(style.entryY)]
    if (Number.isFinite(fixedX) && Number.isFinite(fixedY)) {
      const x = box.x + fixedX * box.width
      const y = box.y + fixedY * box.height
      return { ...end, pins: [turnedPin({ x, y, side: nearestSide(field ? shape : box, x, y) }, box, rotation)] }
    }
    if (field) {
      const y = box.y + box.height / 2
      return {
        ...end,
        pins: [
          { x: shape.x, y, side: 'left' },
          { x: shape.x + shape.width, y, side: 'right' },
        ],
      }
    }
    const [centerX, centerY] = [box.x + box.width / 2, box.y + box.height / 2]
    const pins: RoutingPin[] = [
      { x: centerX, y: box.y, side: 'top' },
      { x: box.x + box.width, y: centerY, side: 'right' },
      { x: centerX, y: box.y + box.height, side: 'bottom' },
      { x: box.x, y: centerY, side: 'left' },
    ]
    return { ...end, pins: pins.map((pin) => turnedPin(pin, box, rotation)) }
  }

  const connectors: RoutingConnector[] = []
  for (const edge of edges) {
    if (!isRouted(edge) || edge.getTerminal(true) === edge.getTerminal(false)) continue
    const source = endOf(edge, true)
    const target = endOf(edge, false)
    if (source && target) connectors.push({ id: edge.getId()!, source, target })
  }
  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  return { shapes: [...shapes.values()].sort(byId), connectors: connectors.sort(byId) }
}
