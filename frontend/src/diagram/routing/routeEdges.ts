import type { Avoid } from 'libavoid-js'
import type { Side } from '../quickConnect.ts'
import type { RoutingEnd, RoutingInput, RoutingPin } from './routingInput.ts'

export interface RoutePoint {
  x: number
  y: number
}

/** Routes by the id of the edge: the points from the start of the edge to its end, in absolute coordinates. */
export type Routes = Record<string, RoutePoint[]>

/** Room between an edge and the shapes it goes around. */
const SHAPE_SPACING = 12
/** Distance between edges that would run along the same line. */
const EDGE_SPACING = 8
/** Cost of a bend, in pixels of length: a route with fewer bends wins over a slightly shorter one. */
const BEND_PENALTY = 50

/**
 * Orthogonal routes of the connectors around the shapes, from one of the pins of each end, with segments of different
 * edges that would overlap moved apart. The router and everything made for it are freed before returning.
 */
export function routeEdges(avoid: Avoid, input: RoutingInput): Routes {
  const router = new avoid.Router(avoid.OrthogonalRouting)
  const made: object[] = []
  const make = <T extends object>(value: T) => {
    made.push(value)
    return value
  }
  try {
    router.setRoutingParameter(avoid.shapeBufferDistance, SHAPE_SPACING)
    router.setRoutingParameter(avoid.idealNudgingDistance, EDGE_SPACING)
    router.setRoutingParameter(avoid.segmentPenalty, BEND_PENALTY)
    router.setRoutingOption(avoid.nudgeOrthogonalSegmentsConnectedToShapes, true)
    router.setRoutingOption(avoid.nudgeSharedPathsWithCommonEndPoint, true)
    router.setRoutingOption(avoid.performUnifyingNudgingPreprocessingStep, true)
    const directions: Record<Side, number> = {
      top: avoid.ConnDirUp,
      right: avoid.ConnDirRight,
      bottom: avoid.ConnDirDown,
      left: avoid.ConnDirLeft,
    }
    const shapes = new Map(
      input.shapes.map((shape) => {
        const centre = make(new avoid.Point(shape.x + shape.width / 2, shape.y + shape.height / 2))
        return [shape.id, { shape, ref: new avoid.ShapeRef(router, make(new avoid.Rectangle(centre, shape.width, shape.height))) }]
      }),
    )
    // An end connects only to the pins of its class. Ends with the same pins share them, and a pin of another class at
    // a point that has one moves along its side: libavoid cannot route to two pins at one point.
    const pinClasses = new Map<string, number>()
    const pinPoints = new Set<string>()
    const freePoint = (id: string, { x, y, side }: RoutingPin) => {
      const step = side === 'left' || side === 'right' ? { x: 0, y: 1 } : { x: 1, y: 0 }
      while (pinPoints.has(`${id} ${x} ${y}`)) {
        x += step.x
        y += step.y
      }
      pinPoints.add(`${id} ${x} ${y}`)
      return { x, y }
    }
    const connEnd = ({ shape: id, pins }: RoutingEnd) => {
      const { shape, ref } = shapes.get(id)!
      const key = `${id} ${JSON.stringify(pins)}`
      let classId = pinClasses.get(key)
      if (classId === undefined) {
        classId = pinClasses.size + 1
        pinClasses.set(key, classId)
        for (const pin of pins) {
          const point = freePoint(id, pin)
          const x = (point.x - shape.x) / shape.width
          const y = (point.y - shape.y) / shape.height
          // Owned by the shape; several edges may end at one pin.
          new avoid.ShapeConnectionPin(ref, classId, x, y, true, 0, directions[pin.side]).setExclusive(false)
        }
      }
      return make(new avoid.ConnEnd(ref, classId))
    }
    const connectors = input.connectors.map(
      (connector) => [connector.id, new avoid.ConnRef(router, connEnd(connector.source), connEnd(connector.target))] as const,
    )
    router.processTransaction()
    return Object.fromEntries(
      connectors.map(([id, connector]) => {
        const route = connector.displayRoute()
        return [id, Array.from({ length: route.size() }, (_, index) => ({ x: route.get_ps(index).x, y: route.get_ps(index).y }))]
      }),
    )
  } finally {
    made.forEach((value) => avoid.destroy(value))
    avoid.destroy(router)
  }
}
