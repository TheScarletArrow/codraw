import postgresql from './providerIcons/postgresql.svg?raw'
import oracle from './providerIcons/oracle.svg?raw'
import elasticsearch from './providerIcons/elasticsearch.svg?raw'
import kafka from './providerIcons/apachekafka.svg?raw'
import mysql from './providerIcons/mysql.svg?raw'
import mongodb from './providerIcons/mongodb.svg?raw'
import redis from './providerIcons/redis.svg?raw'
import rabbitmq from './providerIcons/rabbitmq.svg?raw'
import docker from './providerIcons/docker.svg?raw'
import kubernetes from './providerIcons/kubernetes.svg?raw'
import { imageStyle } from './images.ts'
import type { ShapePreset } from './shapes.ts'

const PROVIDERS = [
  ['provider-postgresql', 'PostgreSQL', postgresql],
  ['provider-oracle', 'Oracle', oracle],
  ['provider-elasticsearch', 'Elasticsearch', elasticsearch],
  ['provider-kafka', 'Kafka', kafka],
  ['provider-mysql', 'MySQL', mysql],
  ['provider-mongodb', 'MongoDB', mongodb],
  ['provider-redis', 'Redis', redis],
  ['provider-rabbitmq', 'RabbitMQ', rabbitmq],
  ['provider-docker', 'Docker', docker],
  ['provider-kubernetes', 'Kubernetes', kubernetes],
] as const

export type ProviderId = (typeof PROVIDERS)[number][0]

// Embedded SVGs survive board copies and exports without fetching assets from the application.
export const PROVIDER_SHAPES: ShapePreset[] = PROVIDERS.map(([id, label, svg]) => ({
  id,
  label,
  value: label,
  width: 64,
  height: 64,
  style: imageStyle(`data:image/svg+xml;base64,${btoa(Array.from(new TextEncoder().encode(svg), (byte) => String.fromCharCode(byte)).join(''))}`),
}))

export function providerImage(id: string): string | undefined {
  return PROVIDER_SHAPES.find((shape) => shape.id === id)?.style.image
}
