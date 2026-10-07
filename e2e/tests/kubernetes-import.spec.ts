import { expect, test } from '@playwright/test'
import { cells, createBoard, edges, twoParticipants, userPage, vertices, type CellInfo } from './helpers.ts'

const SHOP = `apiVersion: apps/v1
kind: Deployment
metadata: { name: frontend, namespace: shop }
spec:
  replicas: 2
  template:
    metadata: { labels: { app: frontend } }
    spec:
      containers: [{ name: web, image: "nginx:1.29" }]
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: backend, namespace: shop }
spec:
  template:
    metadata: { labels: { app: backend } }
    spec:
      containers:
        - name: app
          image: ghcr.io/shop/backend:1.4.0
          env:
            - { name: DB_URL, value: "jdbc:postgresql://postgres:5432/shop" }
            - { name: PAYMENTS_URL, value: "https://payments.billing.svc.cluster.local" }
---
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: postgres, namespace: shop }
spec:
  replicas: 3
  template:
    metadata: { labels: { app: postgres } }
    spec:
      containers: [{ name: db, image: "postgres:16" }]
---
apiVersion: v1
kind: Service
metadata: { name: frontend, namespace: shop }
spec: { selector: { app: frontend }, ports: [{ port: 80 }] }
---
apiVersion: v1
kind: Service
metadata: { name: backend, namespace: shop }
spec: { selector: { app: backend }, ports: [{ port: 8080 }] }
---
apiVersion: v1
kind: Service
metadata: { name: postgres, namespace: shop }
spec: { selector: { app: postgres }, ports: [{ port: 5432 }] }
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: { name: shop, namespace: shop }
spec:
  rules:
    - host: shop.example.com
      http:
        paths:
          - { path: /, pathType: Prefix, backend: { service: { name: frontend, port: { number: 80 } } } }
          - { path: /api, pathType: Prefix, backend: { service: { name: backend, port: { number: 8080 } } } }
`

/** Payments of another namespace, in JSON as `kubectl get -o json` writes a list. */
const BILLING = JSON.stringify({
  apiVersion: 'v1',
  kind: 'List',
  items: [
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'payments', namespace: 'billing' },
      spec: { template: { metadata: { labels: { app: 'payments' } }, spec: { containers: [{ name: 'app', image: 'payments:2' }] } } },
    },
    { apiVersion: 'v1', kind: 'Service', metadata: { name: 'payments', namespace: 'billing' }, spec: { selector: { app: 'payments' } } },
    { apiVersion: 'v1', kind: 'Service', metadata: { name: 'stripe', namespace: 'billing' }, spec: { type: 'ExternalName', externalName: 'api.stripe.com' } },
  ],
})

const FRONTEND = 'frontend\nnginx:1.29\n×2, :80'
const BACKEND = 'backend\nghcr.io/shop/backend:1.4.0\n:8080'
const POSTGRES = 'postgres\npostgres:16\nStatefulSet, ×3, :5432'
const GATEWAY = 'shop\nIngress'
const PAYMENTS = 'payments\npayments:2'
const STRIPE = 'stripe\napi.stripe.com'

const inside = (frame: CellInfo, shape: CellInfo) =>
  shape.x >= frame.x && shape.y >= frame.y && shape.x + shape.width <= frame.x + frame.width && shape.y + shape.height <= frame.y + frame.height

test('manifests of Kubernetes become workloads, a gateway and namespaces for everybody, and are undone in one step', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт Kubernetes…' }).click()
  await menu.getByLabel('Файлы Kubernetes').setInputFiles([
    { name: 'shop.yaml', mimeType: 'application/yaml', buffer: Buffer.from(SHOP) },
    { name: 'billing.json', mimeType: 'application/json', buffer: Buffer.from(BILLING) },
  ])
  await expect(menu.getByRole('status')).toHaveText('Рабочих нагрузок: 4, шлюзов: 1, внешних сервисов: 1, связей: 4, пространств имён: 2')
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()
  await expect(menu).toBeHidden()

  await expect
    .poll(async () => (await vertices(bob)).map((cell) => cell.value).sort())
    .toEqual([FRONTEND, BACKEND, POSTGRES, GATEWAY, PAYMENTS, STRIPE, 'shop', 'billing'].sort())
  const shapes = await vertices(bob)
  const byValue = (value: string) => shapes.find((cell) => cell.value === value)!
  expect(byValue(POSTGRES).style.codrawShape).toBe('database')
  expect(byValue(GATEWAY).style.codrawShape).toBe('api-gateway')
  expect(byValue(STRIPE).style.codrawShape).toBe('external-system')
  const shop = shapes.find((cell) => cell.value === 'shop' && cell.style.codrawShape === 'kubernetes-cluster')!
  const billing = byValue('billing')
  for (const value of [FRONTEND, BACKEND, POSTGRES, GATEWAY]) expect(inside(shop, byValue(value))).toBe(true)
  expect(inside(billing, byValue(PAYMENTS))).toBe(true)
  expect(inside(shop, byValue(STRIPE)) || inside(billing, byValue(STRIPE))).toBe(false)
  const name = (id: string | null) => shapes.find((cell) => cell.id === id)!.value.split('\n')[0]
  expect((await edges(bob)).map((edge) => `${name(edge.source)} -> ${name(edge.target)}: ${edge.value}`).sort()).toEqual(
    ['shop -> frontend: shop.example.com/', 'shop -> backend: shop.example.com/api', 'backend -> postgres: JDBC', 'backend -> payments: HTTPS'].sort(),
  )

  await alice.getByTestId('diagram-canvas').click({ position: { x: 5, y: 5 } })
  await alice.keyboard.press('Control+z')
  await expect.poll(async () => (await cells(bob)).length).toBe(0)

  await close()
})

test('the window refuses a template of Helm and adds the other files', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт Kubernetes…' }).click()
  await menu.getByLabel('Файлы Kubernetes').setInputFiles([
    { name: 'deployment.yaml', mimeType: 'application/yaml', buffer: Buffer.from('kind: Deployment\nspec:\n  replicas: {{ .Values.replicas }}\n') },
    { name: 'billing.json', mimeType: 'application/json', buffer: Buffer.from(BILLING) },
  ])
  await expect(menu.getByRole('alert')).toHaveText('deployment.yaml: это шаблон Helm — выполните helm template и откройте результат')
  await expect(menu.getByRole('status')).toHaveText('Рабочих нагрузок: 1, шлюзов: 0, внешних сервисов: 1, связей: 0, пространств имён: 1')
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()

  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.value).sort()).toEqual(['billing', PAYMENTS, STRIPE].sort())

  await alice.context().close()
})
