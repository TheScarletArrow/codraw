import { describe, expect, it } from 'vitest'
import { LAYER_CELL_ID, type CellData, type GeometryData } from '../diagram/model.ts'
import { findShape } from '../diagram/shapes.ts'
import { diagramSchema } from '../sql/erDiagram.ts'
import { composeGraph } from './composeGraph.ts'
import { infraCells } from './infraCells.ts'
import type { InfraGraph } from './infraGraph.ts'
import { parseCompose } from './parseCompose.ts'
import { parseTerraform } from './parseTerraform.ts'
import { terraformGraph } from './terraformGraph.ts'
import { NETWORKS_COMPOSE, SHOP_COMPOSE } from './testCompose.ts'
import { SHOP_PLAN } from './testTerraform.ts'

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

  it('keeps the label of a component clear of the boxes on its left side', async () => {
    const graph: InfraGraph = { nodes: [{ shape: 'uml-component', lines: [':services:orders', 'Java'], frame: null }], frames: [], edges: [] }
    const [component] = await infraCells(graph, { x: 0, y: 0 })

    expect(component!.style.spacingLeft).toBe(24)
    expect(component!.geometry!.width).toBeGreaterThanOrEqual(':services:orders'.length * 7.5 + 32 + 24)
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

  it('marks the cells with the first lines of their nodes, or with the keys of nodes and frames that have one', async () => {
    const compose = await infraCells(await graphOf(SHOP_COMPOSE), { x: 0, y: 0 }, undefined, 'compose')
    expect(byValue(compose, 'backend\n./backend').style.codrawSource).toBe('compose:node:backend')
    expect(compose.find((cell) => cell.kind === 'edge')!.style.codrawSource).toBe('compose:edge:backend->postgres:')

    const graph = terraformGraph([await parseTerraform({ name: 'plan.json', text: SHOP_PLAN })], { environment: true, c4: false })
    const cells = await infraCells(graph, { x: 0, y: 0 }, undefined, 'terraform')
    expect(byValue(cells, 'aws_rds_cluster.main\naurora-postgresql 16.4').style.codrawSource).toBe('terraform:node:module.app.module.db.aws_rds_cluster.main')
    expect(byValue(cells, 'module.db').style.codrawSource).toBe('terraform:frame:module.app.module.db')
    expect(cells.filter((cell) => cell.kind === 'edge').map((edge) => edge.style.codrawSource)).toContain(
      'terraform:edge:module.app.aws_ecs_service.api->module.network.aws_subnet.this:',
    )
  })

  it('puts a frame in the frame of its parent, drawn over it, and gives the shapes the properties of their elements', async () => {
    const graph = terraformGraph([await parseTerraform({ name: 'plan.json', text: SHOP_PLAN })], { environment: true, c4: false })
    const cells = await infraCells(graph, { x: 0, y: 0 })

    const app = byValue(cells, 'module.app')
    const db = byValue(cells, 'module.db')
    const cluster = byValue(cells, 'aws_rds_cluster.main\naurora-postgresql 16.4')
    expect(inside(app.geometry!, db.geometry!)).toBe(true)
    expect(inside(db.geometry!, cluster.geometry!)).toBe(true)
    expect(inside(app.geometry!, byValue(cells, 'aws_ecs_service.api').geometry!)).toBe(true)
    expect(inside(app.geometry!, byValue(cells, 'module.network').geometry!)).toBe(false)
    expect(cells.indexOf(app)).toBeLessThan(cells.indexOf(db))
    expect(cluster.style).toMatchObject({
      codrawName: 'aws_rds_cluster.main',
      codrawTechnology: 'aws_rds_cluster',
      codrawKind: 'database',
      codrawDescription: expect.stringMatching(/^Terraform: module\.app\.module\.db\.aws_rds_cluster\.main\n/),
    })
    expect(typeof cluster.style.codrawElement).toBe('string')
  })

  it('gives a frame the properties of its element, an edge its technology and a frame as an end, and a shape its link', async () => {
    const graph: InfraGraph = {
      nodes: [
        {
          shape: 'c4-container',
          lines: ['API', '[Container: Kotlin]'],
          frame: 0,
          key: 'api',
          element: { name: 'API', technology: 'Kotlin' },
          link: 'https://wiki.example.com/api',
        },
        { shape: 'c4-person', lines: ['Покупатель', '[Person]'], frame: null, key: 'customer', element: { name: 'Покупатель' } },
        { shape: 'queue', lines: ['События', '[Kafka]'], frame: null, key: 'events', element: { name: 'События', technology: 'Kafka' }, showTechnology: true },
      ],
      frames: [{ shape: 'c4-boundary', label: 'Магазин\n[Software System]', parent: null, key: 'shop', element: { name: 'Магазин', kind: 'c4-system' } }],
      edges: [
        { source: 1, target: 0, label: 'Покупает\n[HTTPS]', technology: 'HTTPS' },
        { source: 0, sourceFrame: true, target: 2, label: 'Публикует' },
      ],
    }
    const cells = await infraCells(graph, { x: 0, y: 0 }, undefined, 'architecture')

    const shop = byValue(cells, 'Магазин\n[Software System]')
    const api = byValue(cells, 'API\n[Container: Kotlin]')
    const events = byValue(cells, 'События\n[Kafka]')
    expect(shop.style).toMatchObject({ codrawShape: 'c4-boundary', codrawKind: 'c4-system', codrawName: 'Магазин', codrawSource: 'architecture:frame:shop' })
    expect(typeof shop.style.codrawElement).toBe('string')
    expect(inside(shop.geometry!, api.geometry!)).toBe(true)
    expect(api.style).toMatchObject({ link: 'https://wiki.example.com/api', codrawTechnology: 'Kotlin' })
    expect(events.style).toMatchObject({ codrawShowTechnology: true, codrawTechnology: 'Kafka' })
    const [buys, publishes] = cells.filter((cell) => cell.kind === 'edge')
    expect(buys!.style).toMatchObject({ codrawTechnology: 'HTTPS', codrawSource: 'architecture:edge:customer->api:Покупает\n[HTTPS]' })
    expect([publishes!.source, publishes!.target]).toEqual([shop.id, events.id])
    expect(publishes!.style.codrawSource).toBe('architecture:edge:shop->events:Публикует')
  })

  it('wraps the lines of a label wider than the largest width of its shape and makes it taller', async () => {
    const description = 'Принимает заказы покупателей, проверяет остатки на складе и резервирует товары до оплаты. '.repeat(2).trim()
    const graph: InfraGraph = {
      nodes: [
        { shape: 'c4-container', lines: ['API', '[Container: Kotlin]', description], frame: null, maxWidth: 320 },
        { shape: 'c4-person', lines: ['Покупатель', '[Person]', description], frame: null, maxWidth: 320 },
      ],
      frames: [],
      edges: [],
    }
    const [container, person] = (await infraCells(graph, { x: 0, y: 0 })).map((cell) => cell.geometry!)

    expect(container!.width).toBe(320)
    // The description takes five lines of 288 px: seven lines in all.
    expect(Math.ceil((description.length * 7.5) / 288)).toBe(5)
    expect(container!.height).toBe(7 * 16 + 20)
    // The head of a person keeps its room above the label.
    expect(person!.height).toBe(7 * 16 + 20 + 70)
  })

  it('adds no tables: the exports of SQL skip the services', async () => {
    const cells = await infraCells(await graphOf(SHOP_COMPOSE), { x: 0, y: 0 })

    expect(diagramSchema(cells).tables).toEqual([])
  })
})
