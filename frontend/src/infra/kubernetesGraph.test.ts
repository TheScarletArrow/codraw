import { describe, expect, it } from 'vitest'
import type { InfraGraph } from './infraGraph.ts'
import { kubernetesGraph, kubernetesGraphError, kubernetesSummary, MAX_KUBERNETES_SHAPES, serviceHost } from './kubernetesGraph.ts'
import { parseKubernetesFiles, type KubeObjects } from './parseKubernetes.ts'
import { BILLING_MANIFESTS, REPORT_MANIFEST, SHOP_MANIFESTS } from './testKubernetes.ts'

const ON = { environment: true, c4: false }
const objectsOf = async (...texts: string[]) =>
  (await parseKubernetesFiles(texts.map((text, index) => ({ name: `${index}.yaml`, text })))).objects

/** The links of the graph as `source -> target: label` by the first lines of their nodes. */
const links = (graph: InfraGraph) =>
  graph.edges.map((edge) => `${graph.nodes[edge.source]!.lines[0]} -> ${graph.nodes[edge.target]!.lines[0]}: ${edge.label}`)
const node = (graph: InfraGraph, name: string) => graph.nodes.find((item) => item.lines[0] === name)!

describe('serviceHost', () => {
  it('reads the name and the namespace of the DNS names of services', () => {
    expect(serviceHost('billing')).toEqual({ name: 'billing', namespace: null })
    expect(serviceHost('billing.payments')).toEqual({ name: 'billing', namespace: 'payments' })
    expect(serviceHost('billing.payments.svc')).toEqual({ name: 'billing', namespace: 'payments' })
    expect(serviceHost('billing.payments.svc.cluster.local')).toEqual({ name: 'billing', namespace: 'payments' })
    expect(serviceHost('api.stripe.com')).toBeNull()
  })
})

describe('kubernetesGraph', () => {
  it('draws the workloads by their images with the ports of their services, the gateway and the namespace', async () => {
    const objects = await objectsOf(SHOP_MANIFESTS)
    const graph = kubernetesGraph(objects, ON)

    expect(graph.nodes).toEqual([
      { shape: 'load-balancer', lines: ['frontend', 'nginx:1.29', '×2, :80'], frame: 0 },
      { shape: 'container', lines: ['backend', 'ghcr.io/shop/backend:1.4.0', ':8080'], frame: 0 },
      { shape: 'database', lines: ['postgres', 'postgres:16', 'StatefulSet, ×3, :5432'], frame: 0 },
      { shape: 'cache', lines: ['redis', 'redis:8', ':6379'], frame: 0 },
      { shape: 'api-gateway', lines: ['shop', 'Ingress'], frame: 0 },
    ])
    expect(graph.frames).toEqual([{ shape: 'kubernetes-cluster', label: 'shop' }])
    expect(links(graph)).toEqual([
      'shop -> frontend: shop.example.com/',
      'shop -> backend: shop.example.com/api',
      'backend -> postgres: JDBC',
      'backend -> redis: ',
    ])
    expect(kubernetesSummary(objects, graph)).toBe('Рабочих нагрузок: 4, шлюзов: 1, внешних сервисов: 0, связей: 4, пространств имён: 1')
  })

  it('links by addresses of services of other namespaces and to external services, with a frame per namespace', async () => {
    const objects = await objectsOf(SHOP_MANIFESTS, BILLING_MANIFESTS)
    const graph = kubernetesGraph(objects, ON)

    expect(links(graph)).toContain('backend -> payments: HTTPS')
    expect(links(graph)).toContain('payments-route -> payments: pay.example.com/v1')
    expect(links(graph)).toContain('payments -> stripe: HTTPS')
    expect(node(graph, 'stripe')).toEqual({ shape: 'external-system', lines: ['stripe', 'api.stripe.com'], frame: null })
    expect(node(graph, 'payments-route')).toEqual({ shape: 'api-gateway', lines: ['payments-route', 'HTTPRoute'], frame: 1 })
    expect(graph.frames.map((frame) => frame.label)).toEqual(['shop', 'billing'])
    expect(kubernetesSummary(objects, graph)).toBe('Рабочих нагрузок: 5, шлюзов: 2, внешних сервисов: 1, связей: 7, пространств имён: 2')
  })

  it('takes no links from variables without the option', async () => {
    const graph = kubernetesGraph(await objectsOf(SHOP_MANIFESTS), { environment: false, c4: false })

    expect(links(graph)).toEqual(['shop -> frontend: shop.example.com/', 'shop -> backend: shop.example.com/api'])
  })

  it('writes the kind, the schedule and the containers of a CronJob', async () => {
    const graph = kubernetesGraph(await objectsOf(REPORT_MANIFEST), ON)

    expect(graph.nodes).toEqual([{ shape: 'container', lines: ['report', 'app:1 +1', 'CronJob 0 3 * * *'], frame: 0 }])
    expect(graph.frames).toEqual([{ shape: 'kubernetes-cluster', label: 'default' }])
  })

  it('makes shapes of C4', async () => {
    const graph = kubernetesGraph(await objectsOf(SHOP_MANIFESTS, BILLING_MANIFESTS), { environment: true, c4: true })

    expect(node(graph, 'postgres')).toEqual({ shape: 'c4-database', lines: ['postgres', '[Container: postgres:16]', 'StatefulSet, ×3, :5432'], frame: 0 })
    expect(node(graph, 'shop')).toEqual({ shape: 'c4-container', lines: ['shop', '[Container: Ingress]'], frame: 0 })
    expect(node(graph, 'stripe')).toEqual({ shape: 'c4-external-system', lines: ['stripe', '[Software System]', 'api.stripe.com'], frame: null })
  })

  it('does not link a service to pods of another namespace or a route to a service that is not in the files', async () => {
    const graph = kubernetesGraph(
      await objectsOf(
        [
          'apiVersion: v1',
          'kind: Pod',
          'metadata: { name: api, namespace: a, labels: { app: api } }',
          'spec: { containers: [{ image: app }] }',
          '---',
          'apiVersion: v1',
          'kind: Service',
          'metadata: { name: api, namespace: b }',
          'spec: { selector: { app: api } }',
          '---',
          'apiVersion: networking.k8s.io/v1',
          'kind: Ingress',
          'metadata: { name: entry, namespace: b }',
          'spec: { rules: [{ http: { paths: [{ path: /, backend: { service: { name: api } } }, { path: /x, backend: { service: { name: missing } } }] } }] }',
        ].join('\n'),
      ),
      ON,
    )

    expect(graph.edges).toEqual([])
  })

  it('is too large beyond the limit of shapes', () => {
    const objects: KubeObjects = {
      workloads: Array.from({ length: MAX_KUBERNETES_SHAPES + 1 }, (_, index) => ({
        kind: 'Pod' as const,
        name: `p${index}`,
        namespace: 'default',
        replicas: null,
        schedule: null,
        labels: {},
        containers: [],
      })),
      services: [],
      gateways: [],
      configMaps: [],
      namespaces: ['default'],
    }

    expect(kubernetesGraphError(kubernetesGraph(objects, ON))).toBe(
      'Слишком много фигур: 301, за раз можно добавить не больше 300 — откройте меньше файлов',
    )
  })
})
