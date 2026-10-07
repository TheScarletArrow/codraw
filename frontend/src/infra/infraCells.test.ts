import { describe, expect, it } from 'vitest'
import { LAYER_CELL_ID, type CellData, type GeometryData } from '../diagram/model.ts'
import { findShape } from '../diagram/shapes.ts'
import { diagramSchema } from '../sql/erDiagram.ts'
import { composeGraph } from './composeGraph.ts'
import { infraCells } from './infraCells.ts'
import type { InfraGraph } from './infraGraph.ts'
import { parseCompose } from './parseCompose.ts'
import { NETWORKS_COMPOSE, SHOP_COMPOSE } from './testCompose.ts'

const graphOf = async (text: string) => composeGraph(await parseCompose({ name: 'docker-compose.yml', text }), { environment: true, c4: false })
const byValue = (cells: CellData[], value: string) => {
  const found = cells.find((cell) => cell.value === value)
  if (!found) throw new Error(`No cell ${value}`)
  return found
}
const inside = (outer: GeometryData, inner: GeometryData) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height
const overlap = (a: GeometryData, b: GeometryData) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe('infraCells', () => {
  it('adds shapes of the palette with their labels and edges between them, from the corner given', async () => {
    const cells = await infraCells(await graphOf(SHOP_COMPOSE), { x: 300, y: 40 })

    const postgres = byValue(cells, 'postgres\npostgres:18-alpine')
    const backend = byValue(cells, 'backend\n./backend')
    const frontend = byValue(cells, 'frontend\nnginx:1.29\n:8080')
    expect(postgres.style).toMatchObject({ codrawShape: 'database', shape: 'cylinder' })
    expect(backend.style.codrawShape).toBe('container')
    expect(frontend.style.codrawShape).toBe('load-balancer')
    expect(cells.filter((cell) => cell.kind === 'edge').map((edge) => [edge.source, edge.target])).toEqual([
      [backend.id, postgres.id],
      [frontend.id, backend.id],
    ])
    const shapes = cells.filter((cell) => cell.kind === 'vertex')
    expect(shapes.every((cell) => cell.parent === LAYER_CELL_ID)).toBe(true)
    expect(Math.min(...shapes.map((cell) => cell.geometry!.x))).toBe(300)
    expect(Math.min(...shapes.map((cell) => cell.geometry!.y))).toBe(40)
    // Laid out from left to right along the links: what depends on another stands left of it.
    expect(frontend.geometry!.x).toBeLessThan(backend.geometry!.x)
    expect(backend.geometry!.x).toBeLessThan(postgres.geometry!.x)
  })

  it('makes shapes wide and tall enough for their labels, but no smaller than in the palette', async () => {
    const graph: InfraGraph = {
      nodes: [
        { shape: 'container', lines: ['w', 'registry.example.com/team/a-rather-long-image-name:1.2.3'], frame: null },
        { shape: 'service', lines: ['a'], frame: null },
      ],
      frames: [],
      edges: [],
    }
    const [worker, small] = (await infraCells(graph, { x: 0, y: 0 })).map((cell) => cell.geometry!)

    expect(worker!.width).toBeGreaterThan('registry.example.com/team/a-rather-long-image-name:1.2.3'.length * 7.5 + 20)
    expect(small).toMatchObject({ width: findShape('service')!.width, height: findShape('service')!.height })
  })

  it('keeps the label of a cube on its front and the label of a cylinder clear of its top', async () => {
    const graph: InfraGraph = {
      nodes: [
        { shape: 'container', lines: ['backend', 'app:1', ':8080'], frame: null },
        { shape: 'database', lines: ['postgres', 'postgres:18', ':5432'], frame: null },
        { shape: 'queue', lines: ['rabbitmq', 'rabbitmq:4-management'], frame: null },
      ],
      frames: [],
      edges: [],
    }
    const [cube, cylinder, lying] = await infraCells(graph, { x: 0, y: 0 })

    expect(cube!.style).toMatchObject({ spacingTop: 20, spacingRight: 20 })
    expect(cube!.geometry!.height).toBeGreaterThanOrEqual(3 * 16 + 20 + 20)
    // The top of a cylinder is a fifth of its height; the label is under it, with room for three lines.
    const { height } = cylinder!.geometry!
    expect(cylinder!.style.spacingTop).toBe(Math.round(height / 5))
    expect(height - 2 * Math.round(height / 5)).toBeGreaterThanOrEqual(3 * 16)
    expect(lying!.style.spacingRight).toBe(Math.min(40, Math.round(lying!.geometry!.width / 5)))
  })

  it('puts the services of each network into its frame, drawn under them', async () => {
    const cells = await infraCells(await graphOf(NETWORKS_COMPOSE), { x: 0, y: 0 })

    for (const [network, service] of [
      ['public', 'frontend\nnginx'],
      ['internal', 'backend\napp'],
      ['default', 'postgres\npostgres'],
    ] as const) {
      const frame = byValue(cells, network)
      expect(frame.style.codrawShape).toBe('boundary')
      expect(inside(frame.geometry!, byValue(cells, service).geometry!)).toBe(true)
      expect(cells.indexOf(frame)).toBeLessThan(cells.indexOf(byValue(cells, service)))
    }
  })

  it('leaves room for a label under a shape, so that it does not run over its neighbours', async () => {
    const graph: InfraGraph = {
      nodes: [
        { shape: 'event-topic', lines: ['orders.created.v1.with-a-long-name', 'confluentinc/cp-kafka:7.6.0'], frame: null },
        { shape: 'object-storage', lines: ['documents-and-pictures-of-users', 'rustfs/rustfs:1.0.1'], frame: null },
        { shape: 'container', lines: ['worker', 'app:1'], frame: null },
      ],
      frames: [],
      edges: [
        { source: 2, target: 0, label: '' },
        { source: 2, target: 1, label: '' },
      ],
    }
    const cells = await infraCells(graph, { x: 0, y: 0 })

    const topic = byValue(cells, 'orders.created.v1.with-a-long-name\nconfluentinc/cp-kafka:7.6.0')
    const bucket = byValue(cells, 'documents-and-pictures-of-users\nrustfs/rustfs:1.0.1')
    expect(topic.geometry).toMatchObject({ width: findShape('event-topic')!.width, height: findShape('event-topic')!.height })
    // The label of each, as wide as its longest line and as tall as its lines, under the shape.
    const label = (cell: CellData, lines: string[]): GeometryData => {
      const width = Math.max(...lines.map((line) => line.length)) * 7.5
      const { x, y, width: shapeWidth, height } = cell.geometry!
      return { x: x + shapeWidth / 2 - width / 2, y: y + height, width, height: lines.length * 16 }
    }
    expect(
      overlap(
        label(topic, ['orders.created.v1.with-a-long-name', 'confluentinc/cp-kafka:7.6.0']),
        label(bucket, ['documents-and-pictures-of-users', 'rustfs/rustfs:1.0.1']),
      ),
    ).toBe(false)
  })

  it('adds no tables: the exports of SQL skip the services', async () => {
    const cells = await infraCells(await graphOf(SHOP_COMPOSE), { x: 0, y: 0 })

    expect(diagramSchema(cells).tables).toEqual([])
  })
})
