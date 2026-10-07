import { describe, expect, it } from 'vitest'
import { addressedHosts } from './addresses.ts'
import { composeGraph, composeGraphError, composeSummary } from './composeGraph.ts'
import { imageKind, imageWords } from './imageKind.ts'
import type { InfraGraph } from './infraGraph.ts'
import { MAX_SERVICES, parseCompose, type ComposeService } from './parseCompose.ts'
import { CODRAW_COMPOSE, NETWORKS_COMPOSE, SHOP_COMPOSE } from './testCompose.ts'

const parse = (text: string) => parseCompose({ name: 'docker-compose.yml', text })
const ON = { environment: true, c4: false }

/** The links of the graph as `source -> target: label` by the first lines of their nodes. */
const links = (graph: InfraGraph) =>
  graph.edges.map((edge) => `${graph.nodes[edge.source]!.lines[0]} -> ${graph.nodes[edge.target]!.lines[0]}: ${edge.label}`)
const node = (graph: InfraGraph, name: string) => graph.nodes.find((item) => item.lines[0] === name)!

describe('imageWords', () => {
  it('drops the registry, the tag and the digest of an image', () => {
    expect(imageWords('bitnami/postgresql:16')).toEqual(['bitnami', 'postgresql'])
    expect(imageWords('docker.elastic.co/elasticsearch/elasticsearch:8.15.0')).toEqual(['elasticsearch', 'elasticsearch'])
    expect(imageWords('localhost:5000/team/redis_exporter@sha256:abc')).toEqual(['team', 'redis', 'exporter'])
    expect(imageWords('mcr.microsoft.com/mssql/server:2022-latest')).toEqual(['mssql', 'server'])
  })
})

describe('imageKind', () => {
  it('knows what the images of the specification are', () => {
    expect(imageKind('bitnami/postgresql:16')).toBe('database')
    expect(imageKind('redis/redis-stack:7')).toBe('cache')
    expect(imageKind('confluentinc/cp-kafka:7.6.0')).toBe('event-topic')
    expect(imageKind('provectuslabs/kafka-ui')).toBe('container')
    expect(imageKind('rustfs/rustfs:1.0.1')).toBe('object-storage')
  })

  it('knows the shapes of other images by whole words', () => {
    expect(imageKind('rabbitmq:4-management')).toBe('queue')
    expect(imageKind('eclipse-mosquitto')).toBe('queue')
    expect(imageKind('traefik:v3')).toBe('load-balancer')
    expect(imageKind('kong/kong-gateway')).toBe('api-gateway')
    expect(imageKind('opensearchproject/opensearch')).toBe('search-index')
    expect(imageKind('clickhouse/clickhouse-server')).toBe('data-warehouse')
    expect(imageKind('mcr.microsoft.com/mssql/server')).toBe('database')
    expect(imageKind('dpage/pgadmin4')).toBe('container')
    expect(imageKind('mongo-express')).toBe('container')
    expect(imageKind('oliver006/redis_exporter')).toBe('container')
    expect(imageKind('prom/prometheus')).toBe('container')
    expect(imageKind(null)).toBe('container')
  })
})

describe('addressedHosts', () => {
  it('finds hosts after a scheme, before a port and as the whole value', () => {
    expect(addressedHosts('jdbc:postgresql://postgres:5432/codraw')).toEqual([{ host: 'postgres', protocol: 'JDBC' }])
    expect(addressedHosts('amqp://guest:secret@rabbit/vhost')).toEqual([{ host: 'rabbit', protocol: 'AMQP' }])
    expect(addressedHosts('kafka1:9092,kafka2:9092')).toEqual([
      { host: 'kafka1', protocol: '' },
      { host: 'kafka2', protocol: '' },
    ])
    expect(addressedHosts('Redis')).toEqual([{ host: 'redis', protocol: '' }])
    expect(addressedHosts('s3://bucket/key')).toEqual([{ host: 'bucket', protocol: 's3' }])
  })

  it('finds no host in values that are not addresses', () => {
    expect(addressedHosts('/var/lib/data')).toEqual([])
    expect(addressedHosts('${SECRET}')).toEqual([])
    expect(addressedHosts('a b')).toEqual([])
  })
})

describe('composeGraph', () => {
  it('adds a shape per service by its image and a link from each service to what it depends on', async () => {
    const graph = composeGraph(await parse(SHOP_COMPOSE), ON)

    expect(graph.nodes).toEqual([
      { shape: 'database', lines: ['postgres', 'postgres:18-alpine'], frame: null },
      { shape: 'container', lines: ['backend', './backend'], frame: null },
      { shape: 'load-balancer', lines: ['frontend', 'nginx:1.29', ':8080'], frame: null },
    ])
    expect(links(graph)).toEqual(['backend -> postgres: ', 'frontend -> backend: '])
    expect(composeSummary(graph)).toBe('Сервисов: 3, связей: 2, сетей: 0')
  })

  it('names links by the protocols of the addresses in variables, one link a direction', async () => {
    const graph = composeGraph(await parse(CODRAW_COMPOSE), ON)

    expect(links(graph)).toEqual([
      'backend -> postgres: JDBC',
      'backend -> s3: HTTP',
      'collab -> backend: HTTP',
      'frontend -> backend: ',
      'frontend -> collab: ',
      'prometheus -> backend: ',
      'prometheus -> collab: ',
    ])
    expect(node(graph, 'collab').lines).toEqual(['collab', 'ghcr.io/thescarletarrow/codraw-collab:latest'])
    expect(node(graph, 'frontend').lines).toEqual(['frontend', 'frontend/Dockerfile', ':8080'])
    expect(node(graph, 'prometheus').lines).toEqual(['prometheus', 'prom/prometheus:v3.15.0', ':9090'])
    expect(node(graph, 's3').shape).toBe('object-storage')
  })

  it('takes no links from variables without the option', async () => {
    const graph = composeGraph(await parse(CODRAW_COMPOSE), { environment: false, c4: false })

    expect(links(graph)).toEqual([
      'backend -> postgres: ',
      'backend -> s3: ',
      'collab -> backend: ',
      'frontend -> backend: ',
      'frontend -> collab: ',
      'prometheus -> backend: ',
      'prometheus -> collab: ',
    ])
  })

  it('links by links, network modes and other names of services, but not to itself or to unknown services', async () => {
    const services = await parse(
      [
        'services:',
        '  app:',
        '    links: ["cache:redis"]',
        '    network_mode: service:vpn',
        '    depends_on: [missing, app]',
        '    environment: { API: "http://api-gw:80", BROKERS: "kafka:9092", SELF: "http://app:1" }',
        '  cache: { image: redis }',
        '  vpn: { image: wireguard }',
        '  gateway: { image: kong, container_name: api-gw }',
        '  queue: { image: redpanda, hostname: kafka }',
      ].join('\n'),
    )

    expect(links(composeGraph(services, ON))).toEqual(['app -> cache: ', 'app -> vpn: ', 'app -> gateway: HTTP', 'app -> queue: '])
  })

  it('draws a frame per network when the services are in two networks or more', async () => {
    const graph = composeGraph(await parse(NETWORKS_COMPOSE), ON)

    expect(graph.frames).toEqual([
      { shape: 'boundary', label: 'public' },
      { shape: 'boundary', label: 'internal' },
      { shape: 'boundary', label: 'default' },
    ])
    expect(graph.nodes.map((item) => item.frame)).toEqual([0, 1, 2])
    expect(composeSummary(graph)).toBe('Сервисов: 3, связей: 0, сетей: 3')
  })

  it('draws no frames for one network', async () => {
    const graph = composeGraph(await parse('services:\n  a: { image: x, networks: [back] }\n  b: { image: y, networks: [back, front] }\n'), ON)

    expect(graph.frames).toEqual([])
    expect(graph.nodes.map((item) => item.frame)).toEqual([null, null])
  })

  it('makes Container and Database of C4 with the image in the label', async () => {
    const graph = composeGraph(await parse(SHOP_COMPOSE), { environment: true, c4: true })

    expect(graph.nodes).toEqual([
      { shape: 'c4-database', lines: ['postgres', '[Container: postgres:18-alpine]'], frame: null },
      { shape: 'c4-container', lines: ['backend', '[Container: ./backend]'], frame: null },
      { shape: 'c4-container', lines: ['frontend', '[Container: nginx:1.29]', ':8080'], frame: null },
    ])
    const worker = composeGraph([{ ...(await parse('services:\n  worker:\n'))[0]! }], { environment: true, c4: true })
    expect(worker.nodes[0]!.lines).toEqual(['worker', '[Container]'])
  })

  it('is too large beyond the limit of services', () => {
    const many: ComposeService[] = Array.from({ length: MAX_SERVICES + 1 }, (_, index) => ({
      name: `s${index}`,
      image: null,
      build: null,
      dependsOn: [],
      links: [],
      networkService: null,
      networks: [],
      aliases: [],
      containerName: null,
      hostname: null,
      ports: [],
      environment: [],
    }))

    expect(composeGraphError(composeGraph(many, ON))).toBe(
      'Слишком много сервисов: 301, за раз можно добавить не больше 300 — откройте меньше файлов',
    )
    expect(composeGraphError(composeGraph(many.slice(1), ON))).toBeNull()
  })
})
