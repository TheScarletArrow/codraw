import type { ApiSource } from '../apiSpec/loadDocument.ts'
import { composeGraph, composeGraphError, composeSummary } from './composeGraph.ts'
import type { InfraGraph, InfraOptions } from './infraGraph.ts'
import { kubernetesGraph, kubernetesGraphError, kubernetesSummary } from './kubernetesGraph.ts'
import { parseComposeFiles, type ComposeService } from './parseCompose.ts'
import { parseKubernetesFiles, type KubeObjects } from './parseKubernetes.ts'
import { MAX_TERRAFORM_SIZE, parseTerraformFiles, type TerraformStack } from './parseTerraform.ts'
import { MAX_TERRAFORM_RESOURCES, terraformGraph, terraformGraphError, terraformSummary, terraformWarnings } from './terraformGraph.ts'
import { infraMessages as m } from './messages.tsx'

/** A format of files of infrastructure: what the window of its import says, and how its files become a graph. */
export interface InfraFormat<Parsed> {
  title: string
  /** What the source of an update of a proposal is called when no file names it. */
  source: string
  /** The name of the field of text. */
  textLabel: string
  placeholder: string
  /** The name of the input of files. */
  filesLabel: string
  accept: string
  /** What the window says before it has a file. */
  hint: string
  /** The checkboxes of the window, which give the options of the graph. */
  options: readonly (keyof InfraOptions)[]
  /** The largest file read, in bytes; 5 MB by default. */
  maxSize?: number
  /** What the format reads and what it does not, for «Ограничения формата». */
  limits?: string[]
  parse: (sources: ApiSource[]) => Promise<{ parsed: Parsed; errors: string[] }>
  /** Nothing to add. */
  isEmpty: (parsed: Parsed) => boolean
  graph: (parsed: Parsed, options: InfraOptions) => InfraGraph
  summary: (parsed: Parsed, graph: InfraGraph) => string
  /** Why the graph is too large to add, or `null`. */
  error: (graph: InfraGraph) => string | null
  /** What the participant should know before adding, which does not keep the graph from being added. */
  warnings?: (parsed: Parsed, graph: InfraGraph) => string[]
}

export const COMPOSE: InfraFormat<ComposeService[]> = {
  title: m.compose.title,
  source: m.compose.source,
  textLabel: 'docker-compose',
  placeholder: 'services:\n  backend:\n    build: ./backend\n    depends_on: [postgres]\n  postgres:\n    image: postgres:18',
  filesLabel: m.compose.filesLabel,
  accept: '.yaml,.yml',
  hint: m.compose.hint,
  options: ['environment', 'c4'],
  parse: async (sources) => {
    const { services, errors } = await parseComposeFiles(sources)
    return { parsed: services, errors }
  },
  isEmpty: (services) => services.length === 0,
  graph: composeGraph,
  summary: (_, graph) => composeSummary(graph),
  error: composeGraphError,
}

export const KUBERNETES: InfraFormat<KubeObjects> = {
  title: m.kubernetes.title,
  source: m.kubernetes.source,
  textLabel: m.kubernetes.textLabel,
  placeholder: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: backend\nspec:\n  template:\n    spec:\n      containers:\n        - image: app:1',
  filesLabel: m.kubernetes.filesLabel,
  accept: '.yaml,.yml,.json',
  hint: m.kubernetes.hint,
  options: ['environment', 'c4'],
  parse: async (sources) => {
    const { objects, errors } = await parseKubernetesFiles(sources)
    return { parsed: objects, errors }
  },
  isEmpty: (objects) => objects.workloads.length + objects.gateways.length + objects.services.filter((service) => service.externalName).length === 0,
  graph: kubernetesGraph,
  summary: kubernetesSummary,
  error: kubernetesGraphError,
}

export const TERRAFORM: InfraFormat<TerraformStack[]> = {
  title: m.terraform.title,
  source: m.terraform.source,
  textLabel: 'JSON Terraform',
  placeholder: '{"format_version": "1.0", "values": {"root_module": {"resources": […]}}}',
  filesLabel: m.terraform.filesLabel,
  accept: '.json',
  hint: m.terraform.hint,
  options: ['c4'],
  maxSize: MAX_TERRAFORM_SIZE,
  limits: m.terraform.limits(MAX_TERRAFORM_SIZE / 1024 / 1024, MAX_TERRAFORM_RESOURCES),
  parse: async (sources) => {
    const { stacks, errors } = await parseTerraformFiles(sources)
    return { parsed: stacks, errors }
  },
  isEmpty: (stacks) => stacks.every((stack) => stack.resources.length === 0),
  graph: terraformGraph,
  summary: terraformSummary,
  error: terraformGraphError,
  warnings: terraformWarnings,
}
