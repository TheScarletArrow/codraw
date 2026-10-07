import { describe, expect, it } from 'vitest'
import { loadDocuments } from '../apiSpec/loadDocument.ts'
import { parseKubernetes, parseKubernetesFiles } from './parseKubernetes.ts'
import { BILLING_MANIFESTS, REPORT_MANIFEST, SHOP_MANIFESTS } from './testKubernetes.ts'

const parse = (text: string, name = 'shop.yaml') => parseKubernetes({ name, text })

describe('loadDocuments', () => {
  it('reads every document of a file, leaving out empty ones', async () => {
    expect(await loadDocuments({ name: 'a.yaml', text: '---\na: 1\n---\nb: 2\n---\n' })).toEqual([{ a: 1 }, { b: 2 }])
    expect(await loadDocuments({ name: 'a.json', text: '{"kind": "List", "items": []}' })).toEqual([{ kind: 'List', items: [] }])
  })

  it('names the line and the column of an error in any document', async () => {
    await expect(loadDocuments({ name: 'a.yaml', text: 'a: 1\n---\nb:\n  c: 1\n d: 2\n' })).rejects.toThrow(/^a\.yaml: строка 5, столбец \d+ — /)
  })
})

describe('parseKubernetes', () => {
  it('reads workloads with their pods, services, an Ingress and a ConfigMap of the shop', async () => {
    const objects = await parse(SHOP_MANIFESTS)

    expect(objects.namespaces).toEqual(['shop'])
    expect(objects.workloads.map((workload) => [workload.kind, workload.name, workload.replicas])).toEqual([
      ['Deployment', 'frontend', 2],
      ['Deployment', 'backend', null],
      ['StatefulSet', 'postgres', 3],
      ['Deployment', 'redis', null],
    ])
    expect(objects.workloads[0]!.labels).toEqual({ app: 'frontend', tier: 'web' })
    expect(objects.workloads[1]!.containers).toEqual([
      {
        image: 'ghcr.io/shop/backend:1.4.0',
        env: [{ value: 'jdbc:postgresql://postgres:5432/shop' }, { configMap: 'backend-config', key: 'cache' }],
        envFrom: ['backend-config'],
      },
    ])
    expect(objects.services.map((service) => [service.name, service.selector, service.ports])).toEqual([
      ['frontend', { app: 'frontend' }, ['80']],
      ['backend', { app: 'backend' }, ['8080']],
      ['postgres', { app: 'postgres' }, ['5432']],
      ['redis', { app: 'redis' }, ['6379']],
    ])
    expect(objects.gateways).toEqual([
      {
        kind: 'Ingress',
        name: 'shop',
        namespace: 'shop',
        routes: [
          { label: 'shop.example.com/', service: 'frontend', namespace: 'shop' },
          { label: 'shop.example.com/api', service: 'backend', namespace: 'shop' },
        ],
      },
    ])
    expect(objects.configMaps).toEqual([
      { name: 'backend-config', namespace: 'shop', data: { cache: 'redis:6379', PAYMENTS_URL: 'https://payments.billing.svc.cluster.local' } },
    ])
  })

  it('reads the items of a List, a route of Gateway API and an external service', async () => {
    const objects = await parse(BILLING_MANIFESTS)

    expect(objects.workloads.map((workload) => workload.name)).toEqual(['payments'])
    expect(objects.services.find((service) => service.name === 'stripe')!.externalName).toBe('api.stripe.com')
    expect(objects.gateways).toEqual([
      {
        kind: 'HTTPRoute',
        name: 'payments-route',
        namespace: 'billing',
        routes: [{ label: 'pay.example.com/v1', service: 'payments', namespace: 'billing' }],
      },
    ])
  })

  it('reads the pod of a CronJob and puts an object without a namespace into default', async () => {
    const [report] = (await parse(REPORT_MANIFEST)).workloads

    expect(report).toMatchObject({ kind: 'CronJob', namespace: 'default', schedule: '0 3 * * *', replicas: null })
    expect(report!.containers.map((container) => container.image)).toEqual(['app:1', 'sidecar:2'])
  })

  it('reads the rules of an Ingress of v1beta1 and its default backend', async () => {
    const objects = await parse(
      [
        'apiVersion: networking.k8s.io/v1beta1',
        'kind: Ingress',
        'metadata: { name: old }',
        'spec:',
        '  backend: { serviceName: fallback, servicePort: 80 }',
        '  rules:',
        '    - http:',
        '        paths:',
        '          - path: /docs',
        '            backend: { serviceName: docs, servicePort: 80 }',
      ].join('\n'),
    )

    expect(objects.gateways[0]!.routes).toEqual([
      { label: '', service: 'fallback', namespace: 'default' },
      { label: '/docs', service: 'docs', namespace: 'default' },
    ])
  })

  it('refuses templates of Helm and files without manifests', async () => {
    await expect(parse('apiVersion: apps/v1\nkind: Deployment\nspec:\n  replicas: {{ .Values.replicas }}\n', 'deployment.yaml')).rejects.toThrow(
      'deployment.yaml: это шаблон Helm — выполните helm template и откройте результат',
    )
    await expect(parse('services:\n  app:\n    image: a\n', 'docker-compose.yml')).rejects.toThrow(
      'docker-compose.yml: это не манифесты Kubernetes — нет объектов с apiVersion и kind',
    )
  })
})

describe('parseKubernetesFiles', () => {
  it('reads the objects of the files together and names the errors of those it cannot read', async () => {
    const { objects, errors } = await parseKubernetesFiles([
      { name: 'shop.yaml', text: SHOP_MANIFESTS },
      { name: 'compose.yaml', text: 'services: {}\n' },
      { name: 'billing.yaml', text: BILLING_MANIFESTS },
    ])

    expect(objects.namespaces).toEqual(['shop', 'billing'])
    expect(objects.workloads.map((workload) => workload.name)).toEqual(['frontend', 'backend', 'postgres', 'redis', 'payments'])
    expect(errors).toEqual(['compose.yaml: это не манифесты Kubernetes — нет объектов с apiVersion и kind'])
  })
})
