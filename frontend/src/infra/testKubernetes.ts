/** Manifests of Kubernetes for the tests of the import. */

/** A shop in the namespace `shop`: a frontend, a backend, a database, their services, an Ingress and a ConfigMap. */
export const SHOP_MANIFESTS = `apiVersion: v1
kind: Namespace
metadata:
  name: shop
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: shop
spec:
  replicas: 2
  selector:
    matchLabels: { app: frontend }
  template:
    metadata:
      labels: { app: frontend, tier: web }
    spec:
      containers:
        - name: web
          image: nginx:1.29
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: shop
spec:
  selector:
    matchLabels: { app: backend }
  template:
    metadata:
      labels: { app: backend }
    spec:
      containers:
        - name: app
          image: ghcr.io/shop/backend:1.4.0
          env:
            - name: DB_URL
              value: jdbc:postgresql://postgres:5432/shop
            - name: CACHE_HOST
              valueFrom:
                configMapKeyRef: { name: backend-config, key: cache }
            - name: PASSWORD
              valueFrom:
                secretKeyRef: { name: db, key: password }
          envFrom:
            - configMapRef: { name: backend-config }
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: backend-config
  namespace: shop
data:
  cache: redis:6379
  PAYMENTS_URL: https://payments.billing.svc.cluster.local
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: shop
spec:
  replicas: 3
  serviceName: postgres
  selector:
    matchLabels: { app: postgres }
  template:
    metadata:
      labels: { app: postgres }
    spec:
      containers:
        - name: db
          image: postgres:16
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: shop
spec:
  template:
    metadata:
      labels: { app: redis }
    spec:
      containers:
        - name: redis
          image: redis:8
---
apiVersion: v1
kind: Service
metadata: { name: frontend, namespace: shop }
spec:
  selector: { app: frontend }
  ports: [{ port: 80, targetPort: 8080 }]
---
apiVersion: v1
kind: Service
metadata: { name: backend, namespace: shop }
spec:
  selector: { app: backend }
  ports: [{ port: 8080 }]
---
apiVersion: v1
kind: Service
metadata: { name: postgres, namespace: shop }
spec:
  selector: { app: postgres }
  ports: [{ port: 5432 }]
---
apiVersion: v1
kind: Service
metadata: { name: redis, namespace: shop }
spec:
  selector: { app: redis }
  ports: [{ port: 6379 }]
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: { name: shop, namespace: shop }
spec:
  ingressClassName: nginx
  rules:
    - host: shop.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: frontend, port: { number: 80 } } }
          - path: /api
            pathType: Prefix
            backend: { service: { name: backend, port: { number: 8080 } } }
`

/** Payments in the namespace `billing`, behind a route of Gateway API, and an external service. */
export const BILLING_MANIFESTS = `apiVersion: v1
kind: List
items:
  - apiVersion: apps/v1
    kind: Deployment
    metadata: { name: payments, namespace: billing }
    spec:
      template:
        metadata: { labels: { app: payments } }
        spec:
          containers:
            - image: ghcr.io/shop/payments:2.0.0
              env:
                - name: STRIPE_URL
                  value: https://stripe
  - apiVersion: v1
    kind: Service
    metadata: { name: payments, namespace: billing }
    spec:
      selector: { app: payments }
      ports: [{ port: 443 }]
  - apiVersion: v1
    kind: Service
    metadata: { name: stripe, namespace: billing }
    spec:
      type: ExternalName
      externalName: api.stripe.com
  - apiVersion: gateway.networking.k8s.io/v1
    kind: HTTPRoute
    metadata: { name: payments-route, namespace: billing }
    spec:
      parentRefs: [{ name: public }]
      hostnames: [pay.example.com]
      rules:
        - matches: [{ path: { type: PathPrefix, value: /v1 } }]
          backendRefs: [{ name: payments, port: 443 }]
`

/** A CronJob without a namespace, with two containers. */
export const REPORT_MANIFEST = `apiVersion: batch/v1
kind: CronJob
metadata:
  name: report
spec:
  schedule: "0 3 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: report
              image: app:1
            - name: sidecar
              image: sidecar:2
`
