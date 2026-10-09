import type { ApiSource } from '../apiSpec/loadDocument.ts'
import { composeGraph, composeGraphError, composeSummary } from './composeGraph.ts'
import type { InfraGraph, InfraOptions } from './infraGraph.ts'
import { kubernetesGraph, kubernetesGraphError, kubernetesSummary } from './kubernetesGraph.ts'
import { parseComposeFiles, type ComposeService } from './parseCompose.ts'
import { parseKubernetesFiles, type KubeObjects } from './parseKubernetes.ts'
import { MAX_TERRAFORM_SIZE, parseTerraformFiles, type TerraformStack } from './parseTerraform.ts'
import { MAX_TERRAFORM_RESOURCES, terraformGraph, terraformGraphError, terraformSummary, terraformWarnings } from './terraformGraph.ts'

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
  title: 'Импорт docker-compose',
  textLabel: 'docker-compose',
  placeholder: 'services:\n  backend:\n    build: ./backend\n    depends_on: [postgres]\n  postgres:\n    image: postgres:18',
  filesLabel: 'Файлы docker-compose',
  accept: '.yaml,.yml',
  hint: 'docker-compose.yml или compose.yaml; несколько файлов сливаются, как docker compose -f a.yml -f b.yml',
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
  title: 'Импорт Kubernetes',
  textLabel: 'Манифесты Kubernetes',
  placeholder: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: backend\nspec:\n  template:\n    spec:\n      containers:\n        - image: app:1',
  filesLabel: 'Файлы Kubernetes',
  accept: '.yaml,.yml,.json',
  hint: 'Манифесты, вывод helm template или kustomize build — в YAML или JSON',
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
  title: 'Импорт Terraform',
  textLabel: 'JSON Terraform',
  placeholder: '{"format_version": "1.0", "values": {"root_module": {"resources": […]}}}',
  filesLabel: 'Файлы Terraform',
  accept: '.json',
  hint: 'Вывод terraform show -json: состояния или сохранённого плана (terraform plan -out=plan.out, затем terraform show -json plan.out > plan.json)',
  options: ['c4'],
  maxSize: MAX_TERRAFORM_SIZE,
  limits: [
    'Читается только JSON из terraform show -json (или tofu show -json) — состояния или сохранённого плана. Файлы .tf и terraform.tfstate не читаются: окно подскажет команду.',
    'Terraform и провайдеры не запускаются, файлы разбираются в браузере и никуда не отправляются.',
    'Из значений ресурсов читаются только безопасные атрибуты — имя, движок и версия, тип машины, сеть, регион, порт; помеченные sensitive не читаются никогда.',
    'Экземпляры count и for_each — одна фигура с ×N; источники данных (data.*) не рисуются, связи проходят через них; лишние связи, которые следуют из других, не рисуются.',
    'Связи плана через local.* не видны: Terraform не выводит локальные значения. В выводе состояния после apply они есть.',
    'Несколько файлов — несколько стеков, каждый в своей рамке; связей между стеками нет.',
    `Файл — до ${MAX_TERRAFORM_SIZE / 1024 / 1024} МБ, за раз — до ${MAX_TERRAFORM_RESOURCES} ресурсов.`,
  ],
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
