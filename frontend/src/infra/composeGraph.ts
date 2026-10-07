import type { ShapeId } from '../diagram/shapes.ts'
import type { InfraEdge, InfraGraph } from './infraGraph.ts'
import { MAX_SERVICES, type ComposeService } from './parseCompose.ts'

export interface ComposeOptions {
  /** Addresses of other services in environment variables become links. */
  environment: boolean
  /** Services become Container and Database of C4. */
  c4: boolean
}

/** What a service is, as its image tells. */
type Kind =
  | 'database'
  | 'cache'
  | 'queue'
  | 'event-topic'
  | 'load-balancer'
  | 'api-gateway'
  | 'object-storage'
  | 'search-index'
  | 'data-warehouse'
  | 'container'

/** Words of images of tools next to a service — a UI, an exporter of metrics — which are containers of their own. */
const TOOLS = ['ui', 'exporter', 'admin', 'commander', 'express', 'console', 'dashboard', 'redisinsight']

/** Words of images, by what the image is; the first kind with a word of the image wins. */
const KINDS: [Kind, string[]][] = [
  [
    'database',
    [
      'postgres',
      'postgresql',
      'postgis',
      'timescaledb',
      'mysql',
      'mariadb',
      'mongo',
      'mongodb',
      'mssql',
      'oracle',
      'cockroach',
      'cockroachdb',
      'cassandra',
      'scylla',
      'scylladb',
      'couchdb',
      'neo4j',
    ],
  ],
  ['cache', ['redis', 'valkey', 'keydb', 'dragonfly', 'dragonflydb', 'memcached']],
  ['queue', ['rabbitmq', 'activemq', 'artemis', 'nats', 'mosquitto']],
  ['event-topic', ['kafka', 'redpanda', 'pulsar']],
  ['load-balancer', ['nginx', 'haproxy', 'traefik', 'envoy', 'caddy']],
  ['api-gateway', ['kong', 'krakend', 'tyk', 'apisix']],
  ['object-storage', ['minio', 'rustfs', 'seaweedfs', 'azurite']],
  ['search-index', ['elasticsearch', 'opensearch', 'solr', 'meilisearch', 'typesense']],
  ['data-warehouse', ['clickhouse', 'druid']],
]

/** The words of the name of an image, without its registry, tag and digest: `bitnami/postgresql:16` is bitnami, postgresql. */
export function imageWords(image: string): string[] {
  const path = image
    .toLowerCase()
    .replace(/@.*$/, '')
    .replace(/:[^/]*$/, '')
    .split('/')
  // The registry is the first part of a longer path that has a dot, a port or is localhost.
  const name = path.length > 1 && /[.:]|^localhost$/.test(path[0]!) ? path.slice(1) : path
  return name.join('/').split(/[^a-z0-9]+/).filter(Boolean)
}

/** What the image of a service is; a service without an image is built from sources, a container. */
export function imageKind(image: string | null): Kind {
  if (!image) return 'container'
  const words = imageWords(image)
  if (words.some((word) => TOOLS.includes(word))) return 'container'
  return KINDS.find(([, known]) => words.some((word) => known.includes(word)))?.[0] ?? 'container'
}

/** The image of a service, else where it is built: the directory of the build, or the Dockerfile in it. */
export function technology(service: ComposeService): string | null {
  if (service.image) return service.image
  if (!service.build) return null
  const { context, dockerfile } = service.build
  if (!dockerfile) return context
  return context === '.' || context === './' ? dockerfile : `${context.replace(/\/$/, '')}/${dockerfile}`
}

const portsLine = (service: ComposeService) => (service.ports.length > 0 ? service.ports.map((port) => `:${port}`).join(', ') : null)

/** The lines of the label of a service: its name, its image or build, its published ports. */
function labelLines(service: ComposeService, c4: boolean): string[] {
  const made = technology(service)
  const kind = c4 ? (made ? `[Container: ${made}]` : '[Container]') : made
  return [service.name, kind, portsLine(service)].filter((line): line is string => line !== null)
}

function shapeOf(kind: Kind, c4: boolean): ShapeId {
  if (c4) return kind === 'database' ? 'c4-database' : 'c4-container'
  return kind
}

/** Names of protocols by the schemes of addresses; another scheme names itself. */
const PROTOCOLS: Record<string, string> = {
  http: 'HTTP',
  https: 'HTTPS',
  ws: 'WebSocket',
  wss: 'WebSocket',
  grpc: 'gRPC',
  grpcs: 'gRPC',
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mongodb: 'MongoDB',
  'mongodb+srv': 'MongoDB',
  redis: 'Redis',
  rediss: 'Redis',
  amqp: 'AMQP',
  amqps: 'AMQP',
  kafka: 'Kafka',
  nats: 'NATS',
  mqtt: 'MQTT',
  mqtts: 'MQTT',
}

export function protocol(scheme: string): string {
  const lower = scheme.toLowerCase()
  return lower.startsWith('jdbc:') ? 'JDBC' : (PROTOCOLS[lower] ?? scheme)
}

/** A host in an address after a scheme and an optional user: `jdbc:postgresql://postgres:5432`, `amqp://user@rabbit`. */
const URL_HOST = /([a-z][a-z0-9+.-]*(?::[a-z][a-z0-9+.-]*)?):\/\/(?:[^@/\s]*@)?([a-z0-9._-]+)/gi
/** A host with a port at the start of a value or after a separator: `kafka:9092`, `a:1,b:2`. */
const HOST_PORT = /(?:^|[\s,;=])([a-z0-9._-]+):\d+/gi

/** The hosts an environment variable names, each with the protocol of its address or `''` without a scheme. */
export function addressedHosts(value: string): { host: string; protocol: string }[] {
  const found: { host: string; protocol: string }[] = []
  for (const match of value.matchAll(URL_HOST)) found.push({ host: match[2]!.toLowerCase(), protocol: protocol(match[1]!) })
  for (const match of value.matchAll(HOST_PORT)) found.push({ host: match[1]!.toLowerCase(), protocol: '' })
  if (/^[a-z0-9._-]+$/i.test(value)) found.push({ host: value.toLowerCase(), protocol: '' })
  return found
}

/**
 * The graph of the services: a shape per service by its image, a link from a service to each service it depends on —
 * by `depends_on`, `links`, `network_mode: service:` and, with `environment`, by addresses in its variables, named by
 * their protocols — and a frame per network when the services are in two networks or more.
 */
export function composeGraph(services: ComposeService[], { environment, c4 }: ComposeOptions): InfraGraph {
  const index = new Map(services.map((service, at) => [service.name, at]))
  const hosts = new Map<string, number>()
  services.forEach((service, at) => {
    for (const host of [service.name, service.containerName, service.hostname, ...service.aliases]) {
      if (host && !hosts.has(host.toLowerCase())) hosts.set(host.toLowerCase(), at)
    }
  })

  const links = new Map<string, InfraEdge & { labels: string[] }>()
  const link = (source: number, target: number | undefined, label: string) => {
    if (target === undefined || target === source) return
    const key = `${source}:${target}`
    let edge = links.get(key)
    if (!edge) {
      edge = { source, target, label: '', labels: [] }
      links.set(key, edge)
    }
    if (label && !edge.labels.includes(label)) {
      edge.labels.push(label)
      edge.label = edge.labels.join(', ')
    }
  }
  services.forEach((service, at) => {
    for (const name of [...service.dependsOn, ...service.links]) link(at, index.get(name), '')
    if (service.networkService) link(at, index.get(service.networkService), '')
    if (!environment) return
    for (const [, value] of service.environment) {
      for (const { host, protocol: name } of addressedHosts(value)) link(at, hosts.get(host), name)
    }
  })

  const networkOf = services.map((service) => service.networks[0] ?? 'default')
  const networks = [...new Set(networkOf)]
  const framed = networks.length >= 2
  return {
    nodes: services.map((service, at) => ({
      shape: shapeOf(imageKind(service.image), c4),
      lines: labelLines(service, c4),
      frame: framed ? networks.indexOf(networkOf[at]!) : null,
    })),
    frames: framed ? networks.map((label) => ({ shape: 'boundary', label })) : [],
    edges: [...links.values()].map(({ source, target, label }) => ({ source, target, label })),
  }
}

/** What the import adds, for the summary before it. */
export function composeSummary(graph: InfraGraph): string {
  return `Сервисов: ${graph.nodes.length}, связей: ${graph.edges.length}, сетей: ${graph.frames.length}`
}

/** Why the graph is too large to add, or `null`. */
export function composeGraphError(graph: InfraGraph): string | null {
  return graph.nodes.length > MAX_SERVICES
    ? `Слишком много сервисов: ${graph.nodes.length}, за раз можно добавить не больше ${MAX_SERVICES} — откройте меньше файлов`
    : null
}
