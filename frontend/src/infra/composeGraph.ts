import type { ShapeId } from '../diagram/shapes.ts'
import { addressedHosts } from './addresses.ts'
import { imageKind, type ImageKind } from './imageKind.ts'
import { InfraEdges, type InfraGraph, type InfraOptions } from './infraGraph.ts'
import { MAX_SERVICES, type ComposeService } from './parseCompose.ts'

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

function shapeOf(kind: ImageKind, c4: boolean): ShapeId {
  if (c4) return kind === 'database' ? 'c4-database' : 'c4-container'
  return kind
}

/**
 * The graph of the services: a shape per service by its image, a link from a service to each service it depends on —
 * by `depends_on`, `links`, `network_mode: service:` and, with `environment`, by addresses in its variables, named by
 * their protocols — and a frame per network when the services are in two networks or more.
 */
export function composeGraph(services: ComposeService[], { environment, c4 }: InfraOptions): InfraGraph {
  const index = new Map(services.map((service, at) => [service.name, at]))
  const hosts = new Map<string, number>()
  services.forEach((service, at) => {
    for (const host of [service.name, service.containerName, service.hostname, ...service.aliases]) {
      if (host && !hosts.has(host.toLowerCase())) hosts.set(host.toLowerCase(), at)
    }
  })

  const links = new InfraEdges()
  services.forEach((service, at) => {
    for (const name of [...service.dependsOn, ...service.links]) links.add(at, index.get(name), '')
    if (service.networkService) links.add(at, index.get(service.networkService), '')
    if (!environment) return
    for (const [, value] of service.environment) {
      for (const { host, protocol } of addressedHosts(value)) links.add(at, hosts.get(host), protocol)
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
    edges: links.list(),
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
