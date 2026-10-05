import { describe, expect, it } from 'vitest'
import { frameParents, layoutGraph, layoutShapes, type LayoutBox, type LayoutShape } from './layout.ts'

const shape = (id: string, x: number, y: number, width = 120, height = 60, frame = false): LayoutShape => ({
  id,
  x,
  y,
  width,
  height,
  frame,
})

const overlap = (a: LayoutBox, b: LayoutBox) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

const inside = (outer: LayoutBox, inner: LayoutBox) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height

describe('auto layout', () => {
  it('puts a chain in layers from left to right, keeping the top-left corner, without overlaps', async () => {
    const shapes = [shape('db', 100, 300), shape('client', 400, 100), shape('api', 250, 500)]
    const edges = [
      { id: 'e1', source: 'client', target: 'api' },
      { id: 'e2', source: 'api', target: 'db' },
    ]

    const boxes = await layoutShapes(shapes, edges, 'right')

    const [client, api, db] = ['client', 'api', 'db'].map((id) => boxes.get(id)!)
    expect(client!.x + client!.width).toBeLessThanOrEqual(api!.x)
    expect(api!.x + api!.width).toBeLessThanOrEqual(db!.x)
    expect(Math.min(client!.x, api!.x, db!.x)).toBe(100)
    expect(Math.min(client!.y, api!.y, db!.y)).toBe(100)
    expect(client).toMatchObject({ width: 120, height: 60 })
  })

  it('puts a chain in layers from top to bottom', async () => {
    const boxes = await layoutShapes(
      [shape('a', 0, 0), shape('b', 0, 0), shape('c', 0, 0)],
      [
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'bc', source: 'b', target: 'c' },
      ],
      'down',
    )

    expect(boxes.get('a')!.y + 60).toBeLessThanOrEqual(boxes.get('b')!.y)
    expect(boxes.get('b')!.y + 60).toBeLessThanOrEqual(boxes.get('c')!.y)
  })

  it('places shapes without edges next to each other, without overlaps', async () => {
    const shapes = [shape('a', 50, 50), shape('b', 60, 60), shape('c', 70, 70, 200, 100)]

    const boxes = await layoutShapes(shapes, [], 'right')

    const all = [...boxes.values()]
    for (const a of all) for (const b of all) if (a !== b) expect(overlap(a, b)).toBe(false)
  })

  it('lays out the shapes of a frame inside it and resizes the frame around them', async () => {
    const cluster = shape('cluster', 500, 0, 300, 600, true)
    const shapes = [
      shape('balancer', 0, 200),
      cluster,
      shape('frontend', 560, 100),
      shape('backend', 560, 250),
      shape('worker', 560, 400),
    ]
    const edges = [
      { id: 'e1', source: 'balancer', target: 'frontend' },
      { id: 'e2', source: 'frontend', target: 'backend' },
    ]

    const boxes = await layoutShapes(shapes, edges, 'right')

    const frame = boxes.get('cluster')!
    for (const id of ['frontend', 'backend', 'worker']) expect(inside(frame, boxes.get(id)!)).toBe(true)
    expect(overlap(frame, boxes.get('balancer')!)).toBe(false)
    expect(boxes.get('frontend')!.y - frame.y).toBeGreaterThanOrEqual(40)
  })

  it('finds the smallest frame that holds the centre of a shape', () => {
    const parents = frameParents([
      shape('outer', 0, 0, 1000, 1000, true),
      shape('inner', 100, 100, 400, 400, true),
      shape('in-inner', 200, 200),
      shape('in-outer', 700, 700),
      shape('outside', 2000, 0),
    ])

    expect(Object.fromEntries(parents)).toEqual({
      outer: null,
      inner: 'outer',
      'in-inner': 'inner',
      'in-outer': 'outer',
      outside: null,
    })
  })

  it('leaves out loops, edges to unknown shapes and edges from a frame to its own shapes', () => {
    const graph = layoutGraph(
      [shape('frame', 0, 0, 500, 500, true), shape('a', 100, 100), shape('b', 1000, 0)],
      [
        { id: 'loop', source: 'a', target: 'a' },
        { id: 'unknown', source: 'a', target: 'gone' },
        { id: 'own', source: 'frame', target: 'a' },
        { id: 'kept', source: 'a', target: 'b' },
      ],
      'right',
    )

    expect(graph.edges?.map((edge) => edge.id)).toEqual(['kept'])
    expect(graph.children?.map((child) => child.id)).toEqual(['frame', 'b'])
    expect(graph.children?.[0]?.children?.map((child) => child.id)).toEqual(['a'])
  })

  it('lays out nothing without shapes', async () => {
    expect((await layoutShapes([], [], 'right')).size).toBe(0)
  })
})
