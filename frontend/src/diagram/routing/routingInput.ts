import type { Cell } from '@maxgraph/core'
import { blocksPlacement, type Side } from '../quickConnect.ts'
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
 * The shapes of a page that edges go around and its edges that are routed automatically, in the order of their ids, so
 * that every participant routes the same. Shapes are the tables as a whole and the other shapes; frames, which let
 * clicks through, and containers of shapes, e.g. groups, are not in the way, their shapes are. An end at a field of
 * a table may leave the table on its left or right border at the middle of the field; an end that the participant
 * fixed to a point of a shape leaves it there; another end leaves its shape at the middle of a side.
 */
export function routingInput(page: Cell): RoutingInput {
  const shapes = new Map<Cell, RoutingShape>()
  const edges: Cell[] = []
  const visit = (parent: Cell) => {
    for (const cell of parent.getChildren()) {
      if (cell.isEdge()) {
        edges.push(cell)
      } else if (cell.isVertex()) {
        const style = cell.getStyle() as ShapeStyle
        const box = absoluteBox(cell)
        if (isTable(cell) || (!cell.getChildren().some((child) => child.isVertex()) && blocksPlacement(style))) {
          if (box && box.width > 0 && box.height > 0) shapes.set(cell, { id: cell.getId()!, ...box })
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
    const shape = shapes.get(field ? terminal.getParent()! : terminal)
    const box = absoluteBox(terminal)
    if (!shape || !box) return null
    const end = { shape: shape.id, cell: terminal.getId()! }
    const style = edge.getStyle() as Record<string, unknown>
    const [fixedX, fixedY] = source ? [number(style.exitX), number(style.exitY)] : [number(style.entryX), number(style.entryY)]
    if (Number.isFinite(fixedX) && Number.isFinite(fixedY)) {
      const x = box.x + fixedX * box.width
      const y = box.y + fixedY * box.height
      return { ...end, pins: [{ x, y, side: nearestSide(shape, x, y) }] }
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
    const [centerX, centerY] = [shape.x + shape.width / 2, shape.y + shape.height / 2]
    return {
      ...end,
      pins: [
        { x: centerX, y: shape.y, side: 'top' },
        { x: shape.x + shape.width, y: centerY, side: 'right' },
        { x: centerX, y: shape.y + shape.height, side: 'bottom' },
        { x: shape.x, y: centerY, side: 'left' },
      ],
    }
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
