/** What a container is, as its image tells; each is a shape of the palette. */
export type ImageKind =
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
const KINDS: [ImageKind, string[]][] = [
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

/** What an image is; a container without an image is built from sources. */
export function imageKind(image: string | null): ImageKind {
  if (!image) return 'container'
  const words = imageWords(image)
  if (words.some((word) => TOOLS.includes(word))) return 'container'
  return KINDS.find(([, known]) => words.some((word) => known.includes(word)))?.[0] ?? 'container'
}
