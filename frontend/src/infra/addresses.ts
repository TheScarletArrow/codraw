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
