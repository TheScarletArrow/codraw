import type { ApiSource } from '../apiSpec/loadDocument.ts'
import { composeGraph, composeGraphError, composeSummary } from './composeGraph.ts'
import type { InfraGraph, InfraOptions } from './infraGraph.ts'
import { kubernetesGraph, kubernetesGraphError, kubernetesSummary } from './kubernetesGraph.ts'
import { parseComposeFiles, type ComposeService } from './parseCompose.ts'
import { parseKubernetesFiles, type KubeObjects } from './parseKubernetes.ts'

/** A format of files of infrastructure: what the window of its import says, and how its files become a graph. */
export interface InfraFormat<Parsed> {
  title: string
  /** The name of the field of text. */
  textLabel: string
  placeholder: string
  /** The name of the input of files. */
  filesLabel: string
  accept: string
  /** What the window says before it has a file. */
  hint: string
  parse: (sources: ApiSource[]) => Promise<{ parsed: Parsed; errors: string[] }>
  /** Nothing to add. */
  isEmpty: (parsed: Parsed) => boolean
  graph: (parsed: Parsed, options: InfraOptions) => InfraGraph
  summary: (parsed: Parsed, graph: InfraGraph) => string
  /** Why the graph is too large to add, or `null`. */
  error: (graph: InfraGraph) => string | null
}

export const COMPOSE: InfraFormat<ComposeService[]> = {
  title: 'Импорт docker-compose',
  textLabel: 'docker-compose',
  placeholder: 'services:\n  backend:\n    build: ./backend\n    depends_on: [postgres]\n  postgres:\n    image: postgres:18',
  filesLabel: 'Файлы docker-compose',
  accept: '.yaml,.yml',
  hint: 'docker-compose.yml или compose.yaml; несколько файлов сливаются, как docker compose -f a.yml -f b.yml',
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
  title: 'Импорт Kubernetes',
  textLabel: 'Манифесты Kubernetes',
  placeholder: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: backend\nspec:\n  template:\n    spec:\n      containers:\n        - image: app:1',
  filesLabel: 'Файлы Kubernetes',
  accept: '.yaml,.yml,.json',
  hint: 'Манифесты, вывод helm template или kustomize build — в YAML или JSON',
  parse: async (sources) => {
    const { objects, errors } = await parseKubernetesFiles(sources)
    return { parsed: objects, errors }
  },
  isEmpty: (objects) => objects.workloads.length + objects.gateways.length + objects.services.filter((service) => service.externalName).length === 0,
  graph: kubernetesGraph,
  summary: kubernetesSummary,
  error: kubernetesGraphError,
}
