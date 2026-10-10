import { ApiSpecError, loadDocuments, type ApiSource } from '../apiSpec/loadDocument.ts'
import { infraMessages } from './messages.tsx'

/** The namespace of an object without one, as `kubectl apply` without `-n` puts it. */
export const DEFAULT_NAMESPACE = 'default'

/** Kinds of workloads, whose pods run containers. */
export const WORKLOAD_KINDS = ['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob', 'Pod'] as const
export type WorkloadKind = (typeof WORKLOAD_KINDS)[number]

/** An environment variable of a container: its value, or the key of a ConfigMap it takes the value from. */
export type KubeVariable = { value: string } | { configMap: string; key: string }

export interface KubeContainer {
  image: string | null
  env: KubeVariable[]
  /** ConfigMaps all of whose values are variables of the container: `envFrom`. */
  envFrom: string[]
}

export interface KubeWorkload {
  kind: WorkloadKind
  name: string
  namespace: string
  /** The replicas of a Deployment, a StatefulSet or a ReplicaSet; `null` when the kind has none or they are not given. */
  replicas: number | null
  /** The schedule of a CronJob. */
  schedule: string | null
  /** The labels of its pods, which services select. */
  labels: Record<string, string>
  containers: KubeContainer[]
}

export interface KubeService {
  name: string
  namespace: string
  selector: Record<string, string>
  ports: string[]
  /** The external host of a Service of `type: ExternalName`. */
  externalName: string | null
}

/** A rule of an entrance: requests of a host and a path go to a service. */
export interface KubeRoute {
  /** `host/path`, the path alone without a host, or `''` for a default backend. */
  label: string
  service: string
  namespace: string
}

/** An Ingress or an HTTPRoute of Gateway API. */
export interface KubeGateway {
  kind: 'Ingress' | 'HTTPRoute'
  name: string
  namespace: string
  routes: KubeRoute[]
}

export interface KubeConfigMap {
  name: string
  namespace: string
  data: Record<string, string>
}

/** The objects of manifests that a diagram shows or reads. */
export interface KubeObjects {
  workloads: KubeWorkload[]
  services: KubeService[]
  gateways: KubeGateway[]
  configMaps: KubeConfigMap[]
  /** Namespaces in the order the objects name them first. */
  namespaces: string[]
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const record = (value: unknown): Record<string, unknown> => (isObject(value) ? value : {})
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const scalar = (value: unknown): string | null =>
  typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : null

/** A map of strings, such as labels, selectors and the data of a ConfigMap. */
const strings = (value: unknown): Record<string, string> =>
  Object.fromEntries(Object.entries(record(value)).flatMap(([key, item]) => (scalar(item) === null ? [] : [[key, scalar(item)!]])))

const isWorkload = (kind: string): kind is WorkloadKind => (WORKLOAD_KINDS as readonly string[]).includes(kind)

function container(value: unknown): KubeContainer {
  const fields = record(value)
  return {
    image: scalar(fields.image),
    env: list(fields.env).flatMap((item): KubeVariable[] => {
      const variable = record(item)
      const text = scalar(variable.value)
      if (text !== null) return [{ value: text }]
      const reference = record(record(variable.valueFrom).configMapKeyRef)
      const configMap = scalar(reference.name)
      const key = scalar(reference.key)
      return configMap && key ? [{ configMap, key }] : []
    }),
    envFrom: list(fields.envFrom).flatMap((item) => scalar(record(record(item).configMapRef).name) ?? []),
  }
}

/** The template of the pods of a workload, or the pod itself. */
function podOf(kind: WorkloadKind, object: Record<string, unknown>): Record<string, unknown> {
  const spec = record(object.spec)
  if (kind === 'Pod') return object
  if (kind === 'CronJob') return record(record(record(spec.jobTemplate).spec).template)
  return record(spec.template)
}

function workload(kind: WorkloadKind, object: Record<string, unknown>, name: string, namespace: string): KubeWorkload {
  const spec = record(object.spec)
  const pod = podOf(kind, object)
  const replicas = ['Deployment', 'StatefulSet', 'ReplicaSet'].includes(kind) && typeof spec.replicas === 'number' ? spec.replicas : null
  return {
    kind,
    name,
    namespace,
    replicas,
    schedule: kind === 'CronJob' ? scalar(spec.schedule) : null,
    labels: strings(record(pod.metadata).labels),
    containers: list(record(pod.spec).containers).map(container),
  }
}

function service(object: Record<string, unknown>, name: string, namespace: string): KubeService {
  const spec = record(object.spec)
  return {
    name,
    namespace,
    selector: strings(spec.selector),
    ports: list(spec.ports).flatMap((port) => scalar(record(port).port) ?? []),
    externalName: spec.type === 'ExternalName' ? scalar(spec.externalName) : null,
  }
}

/** The label of a rule: `host/path`, or the path alone. */
const routeLabel = (host: string | null, path: string) => `${host ?? ''}${path}`

/** The service of a backend of an Ingress: `service.name` of `networking.k8s.io/v1`, `serviceName` of `v1beta1`. */
const backendService = (backend: unknown) => scalar(record(record(backend).service).name) ?? scalar(record(backend).serviceName)

function ingress(object: Record<string, unknown>, name: string, namespace: string): KubeGateway {
  const spec = record(object.spec)
  const routes: KubeRoute[] = []
  const fallback = backendService(spec.defaultBackend ?? spec.backend)
  if (fallback) routes.push({ label: '', service: fallback, namespace })
  for (const rule of list(spec.rules)) {
    const host = scalar(record(rule).host)
    for (const path of list(record(record(rule).http).paths)) {
      const target = backendService(record(path).backend)
      if (target) routes.push({ label: routeLabel(host, scalar(record(path).path) ?? '/'), service: target, namespace })
    }
  }
  return { kind: 'Ingress', name, namespace, routes }
}

function httpRoute(object: Record<string, unknown>, name: string, namespace: string): KubeGateway {
  const spec = record(object.spec)
  const hosts = list(spec.hostnames).flatMap((host) => scalar(host) ?? [])
  const routes: KubeRoute[] = []
  for (const rule of list(spec.rules)) {
    const paths = list(record(rule).matches).flatMap((match) => scalar(record(record(match).path).value) ?? [])
    const labels = (hosts.length > 0 ? hosts : [null]).flatMap((host) => (paths.length > 0 ? paths : ['/']).map((path) => routeLabel(host, path)))
    for (const reference of list(record(rule).backendRefs)) {
      const backend = record(reference)
      const kind = scalar(backend.kind) ?? 'Service'
      const target = scalar(backend.name)
      if (kind !== 'Service' || !target) continue
      for (const label of labels) routes.push({ label, service: target, namespace: scalar(backend.namespace) ?? namespace })
    }
  }
  return { kind: 'HTTPRoute', name, namespace, routes }
}

/** Objects of a document: the document itself, or the items of a `kind: List`. */
function objectsOf(document: unknown): Record<string, unknown>[] {
  if (!isObject(document)) return []
  if (document.kind === 'List' && Array.isArray(document.items)) return document.items.filter(isObject)
  return [document]
}

/** A template of Helm before `helm template`: actions in double braces. */
const HELM_TEMPLATE = /\{\{[\s\S]*?\}\}/

/**
 * The objects of manifests in a file. Throws {@link ApiSpecError} for a template of Helm, a file that does not parse,
 * and a file without any object with `apiVersion` and `kind`.
 */
export async function parseKubernetes(source: ApiSource): Promise<KubeObjects> {
  if (HELM_TEMPLATE.test(source.text)) {
    throw new ApiSpecError(infraMessages.kubernetes.helmTemplate(source.name))
  }
  const objects = (await loadDocuments(source))
    .flatMap(objectsOf)
    .filter((object) => typeof object.apiVersion === 'string' && typeof object.kind === 'string')
  if (objects.length === 0) {
    throw new ApiSpecError(infraMessages.kubernetes.notManifests(source.name))
  }
  const result: KubeObjects = { workloads: [], services: [], gateways: [], configMaps: [], namespaces: [] }
  for (const object of objects) {
    const metadata = record(object.metadata)
    const name = scalar(metadata.name)
    const kind = object.kind as string
    if (!name) continue
    const namespace = kind === 'Namespace' ? name : (scalar(metadata.namespace) ?? DEFAULT_NAMESPACE)
    if (!result.namespaces.includes(namespace) && kind !== 'Namespace') result.namespaces.push(namespace)
    if (isWorkload(kind)) result.workloads.push(workload(kind, object, name, namespace))
    else if (kind === 'Service') result.services.push(service(object, name, namespace))
    else if (kind === 'Ingress') result.gateways.push(ingress(object, name, namespace))
    else if (kind === 'HTTPRoute') result.gateways.push(httpRoute(object, name, namespace))
    else if (kind === 'ConfigMap') result.configMaps.push({ name, namespace, data: strings(object.data) })
  }
  return result
}

/** The objects of the files in their order, and the errors of those that cannot be imported. */
export async function parseKubernetesFiles(sources: ApiSource[]): Promise<{ objects: KubeObjects; errors: string[] }> {
  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        return { objects: await parseKubernetes(source), error: null }
      } catch (error) {
        if (error instanceof ApiSpecError) return { objects: null, error: error.message }
        throw error
      }
    }),
  )
  const objects: KubeObjects = { workloads: [], services: [], gateways: [], configMaps: [], namespaces: [] }
  for (const result of results) {
    if (!result.objects) continue
    objects.workloads.push(...result.objects.workloads)
    objects.services.push(...result.objects.services)
    objects.gateways.push(...result.objects.gateways)
    objects.configMaps.push(...result.objects.configMaps)
    for (const namespace of result.objects.namespaces) if (!objects.namespaces.includes(namespace)) objects.namespaces.push(namespace)
  }
  return { objects, errors: results.flatMap((result) => (result.error !== null ? [result.error] : [])) }
}
