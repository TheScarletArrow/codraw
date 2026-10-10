import type { CellData, StyleValue } from '../diagram/model.ts'
import { sequenceCells } from '../diagram/sequence.ts'
import { relationChanges, type UmlRelation } from '../diagram/useCase.ts'
import type { DrawioPage } from '../drawio/parse.ts'
import { parseMermaid } from '../mermaid/parseMermaid.ts'
import { DiagramBuilder } from './builder.ts'
import { templatesMessages as m } from './messages.ts'

export type TemplateId = 'er' | 'c4-containers' | 'microservices' | 'kubernetes' | 'oauth-login' | 'use-cases'

export interface BoardTemplate {
  id: TemplateId
  /** The name in the language of the interface; a new board and its page are named after it. */
  readonly title: string
  readonly description: string
  /** Builds the cells of the diagram, with new ids and labels in the language of the interface every time. */
  build(): CellData[]
}

/** «Воронья лапка»: many rows of the table at the start refer to one row at the end. */
const MANY_TO_ONE = { startArrow: 'ERzeroToMany', endArrow: 'ERmandOne' }

function entityRelationship(): CellData[] {
  const diagram = new DiagramBuilder()
  const users = diagram.table('users', 40, 40, ['id uuid PK', 'email text', 'name text', 'created_at timestamptz'])
  const boards = diagram.table('boards', 400, 40, ['id uuid PK', 'owner_id uuid FK', 'title text', 'created_at timestamptz'])
  const members = diagram.table('board_members', 400, 260, ['board_id uuid FK', 'user_id uuid FK', 'role text'])
  diagram.edge(boards.fields[1]!, users.fields[0]!, { style: MANY_TO_ONE })
  diagram.edge(members.fields[0]!, boards.fields[0]!, { style: MANY_TO_ONE })
  diagram.edge(members.fields[1]!, users.fields[0]!, { style: MANY_TO_ONE })
  return diagram.build()
}

function c4Containers(): CellData[] {
  const t = m.c4
  const diagram = new DiagramBuilder()
  // The frame first, so that the containers are drawn over it.
  diagram.shape('c4-boundary', 40, 240, { element: { name: t.store, kind: 'c4-system' }, width: 1000, height: 220 })
  const customer = diagram.shape('c4-person', 440, 0, { element: { name: t.customer, description: t.customerDescription } })
  const web = diagram.shape('c4-container', 80, 300, {
    element: { name: t.web, technology: 'React', description: t.webDescription },
  })
  const api = diagram.shape('c4-container', 420, 300, {
    element: { name: 'API', technology: 'Spring Boot', description: t.apiDescription },
  })
  const database = diagram.shape('c4-database', 760, 300, {
    element: { name: t.database, technology: 'PostgreSQL', description: t.databaseDescription },
  })
  const payments = diagram.shape('c4-external-system', 420, 540, {
    element: { name: t.payments, description: t.paymentsDescription },
  })
  const sync = { interaction: 'sync' } as const
  diagram.edge(customer, web, { value: `${t.uses}\n[HTTPS]`, technology: 'HTTPS', ...sync, from: 'left', to: 'top' })
  diagram.edge(web, api, { value: `${t.calls}\n[JSON/HTTPS]`, technology: 'JSON/HTTPS', ...sync, from: 'right', to: 'left' })
  diagram.edge(api, database, { value: `${t.readsWrites}\n[JDBC]`, technology: 'JDBC', ...sync, from: 'right', to: 'left' })
  diagram.edge(api, payments, { value: `${t.pays}\n[HTTPS]`, technology: 'HTTPS', ...sync, from: 'bottom', to: 'top' })
  return diagram.build()
}

function microservices(): CellData[] {
  const t = m.microservices
  const diagram = new DiagramBuilder()
  const browser = diagram.shape('browser', 40, 255, { element: { name: t.browser } })
  const gateway = diagram.shape('api-gateway', 260, 270, { element: { name: t.gateway } })
  const [orders, payments, catalog] = [
    { name: t.orders, database: t.ordersDatabase, y: 60 },
    { name: t.payments, database: t.paymentsDatabase, y: 270 },
    { name: t.catalog, database: t.catalogDatabase, y: 480 },
  ].map(({ name, database, y }) => {
    const service = diagram.shape('service', 480, y, { element: { name } })
    const store = diagram.shape('database', 720, y - 15, { element: { name: database, technology: 'PostgreSQL' } })
    diagram.edge(gateway, service, { from: 'right', to: 'left' })
    diagram.edge(service, store, { from: 'right', to: 'left' })
    return service
  }) as [string, string, string]
  const topic = diagram.shape('event-topic', 470, 177, { element: { name: t.topic, technology: 'Kafka' }, showTechnology: true, width: 140 })
  const kafka = { technology: 'Kafka', interaction: 'async' } as const
  diagram.edge(orders, topic, { value: t.publishes, ...kafka, from: 'bottom', to: 'top' })
  diagram.edge(topic, payments, { value: t.reads, ...kafka, from: 'bottom', to: 'top' })
  const cache = diagram.shape('cache', 725, 610, { element: { name: t.cache, technology: 'Redis' }, showTechnology: true })
  diagram.edge(catalog, cache, { from: 'bottom', to: 'left' })
  diagram.edge(browser, gateway, { value: 'HTTPS', technology: 'HTTPS', interaction: 'sync', from: 'right', to: 'left' })
  return diagram.build()
}

function kubernetes(): CellData[] {
  const diagram = new DiagramBuilder()
  // The frame first, so that the pods are drawn over it.
  diagram.shape('kubernetes-cluster', 560, 60, { width: 460, height: 420 })
  const user = diagram.shape('user', 40, 230)
  const cdn = diagram.shape('cdn', 160, 225)
  const balancer = diagram.shape('load-balancer', 340, 230)
  const ingress = diagram.shape('api-gateway', 600, 230, { value: 'Ingress' })
  const frontend = diagram.shape('container', 840, 110, { value: 'frontend' })
  const backend = diagram.shape('container', 840, 225, { value: 'backend' })
  const worker = diagram.shape('container', 840, 360, { value: 'worker' })
  const database = diagram.shape('database', 1120, 215, { value: m.kubernetes.database })
  const storage = diagram.shape('object-storage', 1140, 363, { value: m.kubernetes.storage })
  const across = { from: 'right', to: 'left' } as const
  diagram.edge(user, cdn, across)
  diagram.edge(cdn, balancer, across)
  diagram.edge(balancer, ingress, across)
  diagram.edge(ingress, frontend, across)
  diagram.edge(ingress, backend, across)
  diagram.edge(backend, database, across)
  diagram.edge(worker, storage, across)
  return diagram.build()
}

/** Signing in with OAuth as a sequence diagram: the code of authorization exchanged for a token, and a failed sign-in. */
function oauthScript(): string {
  const t = m.oauth
  return `sequenceDiagram
  title ${m.gallery['oauth-login'].title}
  autonumber
  actor User as ${t.user}
  participant App as ${t.app}
  participant Auth as ${t.auth}
  participant API
  User->>App: ${t.signIn}
  App-->>User: ${t.redirect}
  User->>Auth: ${t.credentials}
  alt ${t.success}
    Auth-->>User: ${t.redirectWithCode}
    User->>App: ${t.code}
    App->>+Auth: ${t.exchange}
    Auth-->>-App: ${t.token}
    App->>API: ${t.request}
    API-->>App: ${t.data}
    App-->>User: ${t.page}
  else ${t.wrongPassword}
    Auth-->>User: ${t.failure}
  end`
}

function oauthLogin(): CellData[] {
  const diagram = parseMermaid(oauthScript())
  if (diagram.kind !== 'sequence') throw new Error('Not a sequence diagram')
  return sequenceCells(diagram.diagram, { x: 40, y: 40 })
}

/** Use cases of an online store: actors, the system boundary and every relation of use cases. */
function useCases(): CellData[] {
  const t = m.useCases
  const diagram = new DiagramBuilder()
  // The frame first, so that the use cases are drawn over it.
  diagram.shape('uml-system-boundary', 400, 0, { value: t.store, width: 520, height: 480 })
  const useCase = (value: string, x: number, y: number) => diagram.shape('uml-use-case', x, y, { value })
  const find = useCase(t.find, 440, 50)
  const order = useCase(t.order, 440, 200)
  const pay = useCase(t.pay, 440, 350)
  const login = useCase(t.login, 720, 120)
  const coupon = useCase(t.coupon, 720, 280)
  // The names of actors are under them: the generalization comes from the side, not through a name, and the long
  // name of the first actor stays right of the left edge of the page.
  const actor = (value: string, x: number, y: number) => diagram.shape('uml-actor', x, y, { value })
  const customer = actor(t.customer, 260, 210)
  const regular = actor(t.regular, 80, 210)
  const payments = actor(t.payments, 1020, 360)
  // Straight lines, as relations of use cases are drawn, with the keys that «Отношение» gives them.
  const relate = (source: string, target: string, relation: UmlRelation) => {
    const { style, label } = relationChanges(relation, '')
    const keys = Object.entries(style).filter((entry): entry is [string, StyleValue] => entry[1] !== undefined)
    diagram.edge(source, target, { value: label, style: { ...Object.fromEntries(keys), edgeStyle: 'none' } })
  }
  relate(customer, find, 'association')
  relate(customer, order, 'association')
  relate(customer, pay, 'association')
  relate(payments, pay, 'association')
  relate(order, login, 'include')
  relate(coupon, order, 'extend')
  relate(regular, customer, 'generalization')
  return diagram.build()
}

/** A template whose name and description are read in the language of the interface at the moment they are shown. */
const template = (id: TemplateId, build: () => CellData[]): BoardTemplate => ({
  id,
  get title() {
    return m.gallery[id].title
  },
  get description() {
    return m.gallery[id].description
  },
  build,
})

export const BOARD_TEMPLATES: BoardTemplate[] = [
  template('er', entityRelationship),
  template('c4-containers', c4Containers),
  template('microservices', microservices),
  template('kubernetes', kubernetes),
  template('oauth-login', oauthLogin),
  template('use-cases', useCases),
]

/** The template as the only page of a new board, named after the template. */
export function templatePage(template: BoardTemplate): DrawioPage {
  return { id: null, name: template.title, cells: template.build() }
}
