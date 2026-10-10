import type { ShapeId } from '../diagram/shapes.ts'
import { addressedHosts } from './addresses.ts'
import { imageKind } from './imageKind.ts'
import { InfraEdges, type InfraGraph, type InfraNode, type InfraOptions } from './infraGraph.ts'
import type { KubeObjects, KubeService, KubeWorkload } from './parseKubernetes.ts'
import { infraMessages } from './messages.tsx'

/** Shapes one import adds at most: more would not fit a page that people read. */
export const MAX_KUBERNETES_SHAPES = 300

/** The service selects the pods of the workload: they are in one namespace, and the pods have all its labels. */
export function selects(service: KubeService, workload: KubeWorkload): boolean {
  const selector = Object.entries(service.selector)
  return (
    service.externalName === null &&
    service.namespace === workload.namespace &&
    selector.length > 0 &&
    selector.every(([key, value]) => workload.labels[key] === value)
  )
}

/** The image of the first container, and how many more containers the pod has: `app:1 +1`. */
function imageLine(workload: KubeWorkload): string | null {
  const image = workload.containers[0]?.image ?? null
  if (image === null) return null
  return workload.containers.length > 1 ? `${image} +${workload.containers.length - 1}` : image
}

/** What sets a workload apart on a diagram of a deployment: its kind but a Deployment, its schedule, replicas and ports. */
function detailsLine(workload: KubeWorkload, ports: string[]): string | null {
  const kind = workload.kind === 'Deployment' ? null : workload.schedule ? `${workload.kind} ${workload.schedule}` : workload.kind
  const replicas = workload.replicas !== null && workload.replicas > 1 ? `×${workload.replicas}` : null
  const parts = [kind, replicas, ...ports.map((port) => `:${port}`)].filter((part): part is string => part !== null)
  return parts.length > 0 ? parts.join(', ') : null
}

const lines = (...items: (string | null)[]) => items.filter((item): item is string => item !== null)

/** The name and the namespace of a service a host of the cluster names: `billing`, `billing.payments.svc.cluster.local`. */
export function serviceHost(host: string): { name: string; namespace: string | null } | null {
  const parts = host.replace(/\.svc(\.cluster\.local)?$/, '').split('.')
  if (parts.length > 2 || parts.some((part) => part === '')) return null
  return { name: parts[0]!, namespace: parts[1] ?? null }
}

/**
 * The graph of the objects: a shape per workload by the image of its first container, a gateway per Ingress and
 * HTTPRoute with links to the workloads behind the services of its rules, an external system per Service of
 * `ExternalName`, links of addresses of services in the variables of containers and a frame per namespace.
 */
export function kubernetesGraph(objects: KubeObjects, { environment, c4 }: InfraOptions): InfraGraph {
  const nodes: InfraNode[] = []
  const namespaces: string[] = []
  const frameOf = (namespace: string) => {
    if (!namespaces.includes(namespace)) namespaces.push(namespace)
    return namespaces.indexOf(namespace)
  }

  const workloads = objects.workloads.map((workload) => {
    const ports = [...new Set(objects.services.filter((service) => selects(service, workload)).flatMap((service) => service.ports))]
    const image = imageLine(workload)
    const kind = imageKind(workload.containers[0]?.image ?? null)
    const shape: ShapeId = c4 ? (kind === 'database' ? 'c4-database' : 'c4-container') : kind
    const label = c4 ? lines(workload.name, image ? `[Container: ${image}]` : '[Container]', detailsLine(workload, ports)) : lines(workload.name, image, detailsLine(workload, ports))
    return nodes.push({ shape, lines: label, frame: frameOf(workload.namespace) }) - 1
  })
  const gateways = objects.gateways.map(
    (gateway) =>
      nodes.push({
        shape: c4 ? 'c4-container' : 'api-gateway',
        lines: [gateway.name, c4 ? `[Container: ${gateway.kind}]` : gateway.kind],
        frame: frameOf(gateway.namespace),
      }) - 1,
  )
  const externals = new Map<KubeService, number>()
  for (const service of objects.services) {
    if (service.externalName === null) continue
    const label = c4 ? [service.name, '[Software System]', service.externalName] : [service.name, service.externalName]
    externals.set(service, nodes.push({ shape: c4 ? 'c4-external-system' : 'external-system', lines: label, frame: null }) - 1)
  }

  /** The nodes behind a service: the workloads it selects, or its external system. */
  const behind = (service: KubeService | undefined): number[] => {
    if (!service) return []
    const external = externals.get(service)
    if (external !== undefined) return [external]
    return objects.workloads.flatMap((workload, at) => (selects(service, workload) ? [workloads[at]!] : []))
  }
  const serviceNamed = (name: string, namespace: string | null, near: string) =>
    namespace !== null
      ? objects.services.find((service) => service.name === name && service.namespace === namespace)
      : (objects.services.find((service) => service.name === name && service.namespace === near) ??
        objects.services.find((service) => service.name === name))

  const links = new InfraEdges()
  objects.gateways.forEach((gateway, at) => {
    for (const route of gateway.routes) {
      for (const target of behind(serviceNamed(route.service, route.namespace, gateway.namespace))) links.add(gateways[at]!, target, route.label)
    }
  })
  if (environment) {
    const configMap = (name: string, namespace: string) =>
      objects.configMaps.find((item) => item.name === name && item.namespace === namespace)?.data ?? {}
    objects.workloads.forEach((workload, at) => {
      const values = workload.containers.flatMap((container) => [
        ...container.env.map((variable) => ('value' in variable ? variable.value : configMap(variable.configMap, workload.namespace)[variable.key])),
        ...container.envFrom.flatMap((name) => Object.values(configMap(name, workload.namespace))),
      ])
      for (const value of values) {
        if (value === undefined) continue
        for (const { host, protocol } of addressedHosts(value)) {
          const named = serviceHost(host)
          if (!named) continue
          for (const target of behind(serviceNamed(named.name, named.namespace, workload.namespace))) links.add(workloads[at]!, target, protocol)
        }
      }
    })
  }
  return { nodes, frames: namespaces.map((label) => ({ shape: 'kubernetes-cluster', label })), edges: links.list() }
}

/** What the import adds, for the summary before it. */
export function kubernetesSummary(objects: KubeObjects, graph: InfraGraph): string {
  const externals = objects.services.filter((service) => service.externalName !== null).length
  return infraMessages.kubernetes.summary(
    objects.workloads.length,
    objects.gateways.length,
    externals,
    graph.edges.length,
    graph.frames.length,
  )
}

/** Why the graph is too large to add, or `null`. */
export function kubernetesGraphError(graph: InfraGraph): string | null {
  return graph.nodes.length > MAX_KUBERNETES_SHAPES
    ? infraMessages.kubernetes.tooMany(graph.nodes.length, MAX_KUBERNETES_SHAPES)
    : null
}
