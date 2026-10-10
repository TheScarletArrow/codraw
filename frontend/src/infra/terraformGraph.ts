import type { ShapeId } from '../diagram/shapes.ts'
import { InfraEdges, type InfraEdge, type InfraFrame, type InfraGraph, type InfraNode, type InfraOptions } from './infraGraph.ts'
import { moduleAddress, type TerraformResource, type TerraformStack } from './parseTerraform.ts'
import { resourceKind } from './resourceKind.ts'
import { infraMessages } from './messages.tsx'

/** Resources one import adds at most: more would not fit a page that people read. */
export const MAX_TERRAFORM_RESOURCES = 300

/** The shape of a resource of a type that has no shape of its own: it does not pass the resource off as something else. */
export const GENERIC_SHAPE: ShapeId = 'rectangle'

/** Items a warning names at most, and the types of the warning about universal shapes. */
const LISTED = 5
const LISTED_TYPES = 10

/** The groups of attributes of the line of details, the first one a resource has of each: software, size, network. */
const DETAILS: string[][] = [
  ['engine', 'database_version', 'runtime', 'image', 'kubernetes_version'],
  ['instance_type', 'instance_class', 'node_type', 'machine_type', 'vm_size', 'size', 'sku_name', 'load_balancer_type'],
  ['cidr_block', 'ip_cidr_range'],
]

/** What sets a resource apart: `postgres 16.3, db.t3.micro`, `t3.micro, ×2`, `10.0.0.0/16`. */
export function detailsLine(resource: TerraformResource): string | null {
  const attributes = new Map(resource.attributes)
  const parts = DETAILS.flatMap((group) => {
    const attribute = group.find((name) => attributes.has(name))
    if (!attribute) return []
    const value = attributes.get(attribute)!
    const version = attributes.get('engine_version')
    return [attribute === 'engine' && version ? `${value} ${version}` : value]
  })
  if (resource.instances > 1) parts.push(`×${resource.instances}`)
  return parts.length > 0 ? parts.join(', ') : null
}

/** The description of the element: the address, the provider and the safe attributes it has. */
function description(resource: TerraformResource): string {
  return [
    `Terraform: ${resource.address}${resource.instances > 1 ? infraMessages.terraform.instances(resource.instances) : ''}`,
    ...(resource.provider ? [infraMessages.terraform.provider(resource.provider)] : []),
    ...resource.attributes.map(([name, value]) => `${name} = ${value}`),
  ].join('\n')
}

const kindOf = (resource: TerraformResource) => resourceKind(resource.type, new Map(resource.attributes))

function shapeOf(resource: TerraformResource, c4: boolean): ShapeId {
  const kind = kindOf(resource)
  if (c4) return kind === 'database' ? 'c4-database' : 'c4-container'
  return kind ?? GENERIC_SHAPE
}

/**
 * The links without those that follow from the others — A→B and B→C make A→C needless — as `terraform graph` draws
 * them: the dependencies of a state hold every resource a resource waits for. Terraform has no cycles; links with one
 * are left as they are.
 */
export function reduceEdges(edges: InfraEdge[], count: number): InfraEdge[] {
  const children = Array.from({ length: count }, () => [] as number[])
  const incoming = new Array<number>(count).fill(0)
  for (const { source, target } of edges) {
    children[source]!.push(target)
    incoming[target]!++
  }
  const order: number[] = []
  const ready = incoming.flatMap((links, node) => (links === 0 ? [node] : []))
  while (ready.length > 0) {
    const node = ready.pop()!
    order.push(node)
    for (const child of children[node]!) if (--incoming[child]! === 0) ready.push(child)
  }
  if (order.length < count) return edges

  // What each node reaches, and what it reaches through its children: a link to a node reached through a child is needless.
  const words = Math.ceil(count / 32)
  const reach = Array.from({ length: count }, () => new Uint32Array(words))
  const through = Array.from({ length: count }, () => new Uint32Array(words))
  for (const node of order.reverse()) {
    for (const child of children[node]!) for (let word = 0; word < words; word++) through[node]![word]! |= reach[child]![word]!
    reach[node]!.set(through[node]!)
    for (const child of children[node]!) reach[node]![child >>> 5]! |= 1 << (child & 31)
  }
  return edges.filter(({ source, target }) => (through[source]![target >>> 5]! & (1 << (target & 31))) === 0)
}

/**
 * The graph of the stacks: a shape per resource by its type, with the details of its safe attributes and the properties
 * of its element, a link from a resource to each resource it depends on but those that follow from other links, a
 * frame per module inside the frame of its parent, and a frame per file when there are several.
 */
export function terraformGraph(stacks: TerraformStack[], { c4 }: InfraOptions): InfraGraph {
  const nodes: InfraNode[] = []
  const frames: InfraFrame[] = []
  const links = new InfraEdges()
  const several = stacks.length > 1
  for (const stack of stacks) {
    const prefix = several ? `${stack.name}/` : ''
    const top = several ? frames.push({ shape: 'boundary', label: stack.name, parent: null, key: stack.name }) - 1 : null
    const modules = new Map<string, number>()
    const frameOf = (module: string[]): number | null => {
      if (module.length === 0) return top
      const address = moduleAddress(module)
      let index = modules.get(address)
      if (index === undefined) {
        const parent = frameOf(module.slice(0, -1))
        index = frames.push({ shape: 'boundary', label: `module.${module.at(-1)!}`, parent, key: prefix + address }) - 1
        modules.set(address, index)
      }
      return index
    }

    const indexes = new Map<string, number>()
    for (const resource of stack.resources) {
      const name = `${resource.type}.${resource.name}`
      const details = detailsLine(resource)
      const lines = [name, ...(c4 ? [`[Container: ${resource.type}]`] : []), ...(details ? [details] : [])]
      // C4 writes the description into the label: there it is the line of details.
      const element = { name, technology: resource.type, description: c4 ? (details ?? '') : description(resource) }
      const node = { shape: shapeOf(resource, c4), lines, frame: frameOf(resource.module), key: prefix + resource.address, element }
      indexes.set(resource.address, nodes.push(node) - 1)
    }
    for (const resource of stack.resources) {
      for (const dependency of resource.dependsOn) links.add(indexes.get(resource.address)!, indexes.get(dependency), '')
    }
  }
  return { nodes, frames, edges: reduceEdges(links.list(), nodes.length) }
}

/** What the import adds, for the summary before it. */
export function terraformSummary(stacks: TerraformStack[], graph: InfraGraph): string {
  const several = stacks.length > 1
  const modules = graph.frames.length - (several ? stacks.length : 0)
  return infraMessages.terraform.summary(graph.nodes.length, graph.edges.length, modules) + (several ? infraMessages.terraform.stacks(stacks.length) : '')
}

const listed = (items: string[], most = LISTED) =>
  items.length > most ? infraMessages.terraform.andMore(items.slice(0, most).join(', '), items.length - most) : items.join(', ')

/**
 * What the participant should know before adding: the types drawn with a universal shape, links to resources the files
 * do not have, links a plan may lack, resources a plan deletes and a plan that failed.
 */
export function terraformWarnings(stacks: TerraformStack[]): string[] {
  const generic = new Map<string, number>()
  for (const stack of stacks) {
    for (const resource of stack.resources) if (kindOf(resource) === null) generic.set(resource.type, (generic.get(resource.type) ?? 0) + 1)
  }
  const warnings: string[] = []
  if (generic.size > 0) {
    const types = [...generic].map(([type, count]) => (count > 1 ? `${type} ×${count}` : type))
    warnings.push(infraMessages.terraform.generic(listed(types, LISTED_TYPES)))
  }
  for (const stack of stacks) {
    if (stack.errored) warnings.push(infraMessages.terraform.errored(stack.name))
    if (stack.missing.length > 0) {
      warnings.push(infraMessages.terraform.missing(stack.name, listed(stack.missing.map(([from, to]) => `${from} → ${to}`))))
    }
    if (stack.locals.length > 0) {
      warnings.push(infraMessages.terraform.locals(stack.name, listed(stack.locals)))
    }
    if (stack.deleted.length > 0) warnings.push(infraMessages.terraform.deleted(stack.name, listed(stack.deleted)))
  }
  return warnings
}

/** Why the graph is too large to add, or `null`. */
export function terraformGraphError(graph: InfraGraph): string | null {
  return graph.nodes.length > MAX_TERRAFORM_RESOURCES
    ? infraMessages.terraform.tooMany(graph.nodes.length, MAX_TERRAFORM_RESOURCES)
    : null
}
