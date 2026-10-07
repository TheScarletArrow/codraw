// @vitest-environment node
import { AvoidLib, type Avoid } from 'libavoid-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { routeEdges, type RoutePoint } from './routeEdges.ts'
import type { RoutingBox, RoutingEnd, RoutingInput, RoutingShape } from './routingInput.ts'

let avoid: Avoid
beforeAll(async () => {
  await AvoidLib.load()
  avoid = AvoidLib.getInstance()
})

const shape = (id: string, x: number, y: number, width: number, height: number): RoutingShape => ({ id, x, y, width, height })
/** The end at a field of a table, at `y` from the top of the page. */
const field = (table: RoutingShape, y: number): RoutingEnd => ({
  shape: table.id,
  cell: `${table.id}-${y}`,
  pins: [
    { x: table.x, y, side: 'left' },
    { x: table.x + table.width, y, side: 'right' },
  ],
})
const sides = (box: RoutingShape): RoutingEnd => ({
  shape: box.id,
  cell: box.id,
  pins: [
    { x: box.x + box.width / 2, y: box.y, side: 'top' },
    { x: box.x + box.width, y: box.y + box.height / 2, side: 'right' },
    { x: box.x + box.width / 2, y: box.y + box.height, side: 'bottom' },
    { x: box.x, y: box.y + box.height / 2, side: 'left' },
  ],
})

/** Whether a horizontal or vertical segment goes through the inside of a box. */
function crosses(a: RoutePoint, b: RoutePoint, box: RoutingBox): boolean {
  const [left, right] = [Math.min(a.x, b.x), Math.max(a.x, b.x)]
  const [top, bottom] = [Math.min(a.y, b.y), Math.max(a.y, b.y)]
  return left < box.x + box.width && right > box.x && top < box.y + box.height && bottom > box.y
}
const segments = (points: RoutePoint[]) => points.slice(1).map((point, index) => [points[index]!, point] as const)

describe('routes of edges', () => {
  const boards = shape('boards', 0, 0, 200, 82)
  const users = shape('users', 400, 100, 200, 56)

  it('goes around a table in the way, from the side of the field to the side of the other field', () => {
    const blocker = shape('blocker', 260, 40, 80, 300)
    const input: RoutingInput = {
      shapes: [blocker, boards, users],
      connectors: [{ id: 'owner', source: field(boards, 69), target: field(users, 143) }],
    }
    const route = routeEdges(avoid, input).owner!

    expect(route[0]).toEqual({ x: 200, y: 69 })
    expect(route.at(-1)).toEqual({ x: 400, y: 143 })
    for (const [a, b] of segments(route)) {
      expect(a.x === b.x || a.y === b.y).toBe(true)
      for (const box of [blocker, boards, users]) expect(crosses(a, b, box)).toBe(false)
    }
  })

  it('goes straight between shapes that are in line', () => {
    const a = shape('a', 0, 0, 100, 60)
    const b = shape('b', 300, 0, 100, 60)
    const routes = routeEdges(avoid, { shapes: [a, b], connectors: [{ id: 'ab', source: sides(a), target: sides(b) }] })

    expect(routes.ab).toEqual([
      { x: 100, y: 30 },
      { x: 300, y: 30 },
    ])
  })

  it('keeps two edges to one field apart up to the table', () => {
    const members = shape('members', 0, 200, 200, 56)
    const routes = routeEdges(avoid, {
      shapes: [boards, members, users],
      connectors: [
        { id: 'owner', source: field(boards, 69), target: field(users, 143) },
        { id: 'member', source: field(members, 243), target: field(users, 143) },
      ],
    })
    const [owner, member] = [routes.owner!, routes.member!]

    expect(owner.at(-1)!.x).toBe(400)
    expect(member.at(-1)!.x).toBe(400)
    // The last segments run side by side, not on one line.
    expect(owner.at(-1)!.y).not.toBe(member.at(-1)!.y)
    expect(Math.abs(owner.at(-1)!.y - member.at(-1)!.y)).toBeLessThanOrEqual(16)
  })

  it('routes an end fixed to a point where another edge may end too', () => {
    const fixed: RoutingEnd = { shape: users.id, cell: 'users-143', pins: [{ x: 400, y: 143, side: 'left' }] }
    const routes = routeEdges(avoid, {
      shapes: [boards, users],
      connectors: [
        { id: 'free', source: field(boards, 69), target: field(users, 143) },
        { id: 'fixed', source: field(boards, 43), target: fixed },
      ],
    })

    for (const route of Object.values(routes)) {
      expect(route.at(-1)!.x).toBe(400)
      for (const [a, b] of segments(route)) expect(a.x === b.x || a.y === b.y).toBe(true)
    }
  })

  it('ends an edge at a pin of a turned shape inside the box around it, going around what is in the way', () => {
    // A rectangle 120 × 60 around (400, 100) turned by 30°, in the way with the box around it; the middles of its
    // sides are inside that box.
    const turned = shape('turned', 333.04, 44.02, 133.92, 111.96)
    const pins: RoutingEnd = {
      shape: turned.id,
      cell: turned.id,
      pins: [
        { x: 415, y: 74.02, side: 'top' },
        { x: 451.96, y: 130, side: 'right' },
        { x: 385, y: 125.98, side: 'bottom' },
        { x: 348.04, y: 70, side: 'left' },
      ],
    }
    const a = shape('a', 0, 40, 100, 60)
    const blocker = shape('blocker', 180, 20, 60, 100)
    const route = routeEdges(avoid, { shapes: [a, blocker, turned], connectors: [{ id: 'turned', source: sides(a), target: pins }] })
      .turned!

    expect(pins.pins.map(({ x, y }) => ({ x, y }))).toContainEqual(route.at(-1))
    for (const [from, to] of segments(route)) {
      expect(from.x === to.x || from.y === to.y).toBe(true)
      for (const box of [a, blocker]) expect(crosses(from, to, box)).toBe(false)
    }
    // The last segment comes from outside the box around the turned shape.
    const before = route.at(-2)!
    expect(before.x <= turned.x || before.y <= turned.y || before.y >= turned.y + turned.height).toBe(true)
  })
})
