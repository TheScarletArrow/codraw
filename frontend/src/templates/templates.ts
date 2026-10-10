import type { CellData, StyleValue } from '../diagram/model.ts'
import { sequenceCells } from '../diagram/sequence.ts'
import { relationChanges, type UmlRelation } from '../diagram/useCase.ts'
import type { DrawioPage } from '../drawio/parse.ts'
import { parseMermaid } from '../mermaid/parseMermaid.ts'
import { DiagramBuilder } from './builder.ts'

export type TemplateId = 'er' | 'c4-containers' | 'microservices' | 'kubernetes' | 'oauth-login' | 'use-cases'

export interface BoardTemplate {
  id: TemplateId
  title: string
  description: string
  /** Builds the cells of the diagram, with new ids every time. */
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
  const diagram = new DiagramBuilder()
  // The frame first, so that the containers are drawn over it.
  diagram.shape('c4-boundary', 40, 240, { element: { name: 'Интернет-магазин', kind: 'c4-system' }, width: 1000, height: 220 })
  const customer = diagram.shape('c4-person', 440, 0, { element: { name: 'Покупатель', description: 'Выбирает и оплачивает товары' } })
  const web = diagram.shape('c4-container', 80, 300, {
    element: { name: 'Веб-приложение', technology: 'React', description: 'Каталог, корзина и оформление заказа' },
  })
  const api = diagram.shape('c4-container', 420, 300, {
    element: { name: 'API', technology: 'Spring Boot', description: 'Заказы, оплата и каталог' },
  })
  const database = diagram.shape('c4-database', 760, 300, {
    element: { name: 'База данных', technology: 'PostgreSQL', description: 'Товары, заказы и покупатели' },
  })
  const payments = diagram.shape('c4-external-system', 420, 540, {
    element: { name: 'Платёжный шлюз', description: 'Принимает оплату картой' },
  })
  const sync = { interaction: 'sync' } as const
  diagram.edge(customer, web, { value: 'Использует\n[HTTPS]', technology: 'HTTPS', ...sync, from: 'left', to: 'top' })
  diagram.edge(web, api, { value: 'Вызывает\n[JSON/HTTPS]', technology: 'JSON/HTTPS', ...sync, from: 'right', to: 'left' })
  diagram.edge(api, database, { value: 'Читает и пишет\n[JDBC]', technology: 'JDBC', ...sync, from: 'right', to: 'left' })
  diagram.edge(api, payments, { value: 'Проводит оплату\n[HTTPS]', technology: 'HTTPS', ...sync, from: 'bottom', to: 'top' })
  return diagram.build()
}

function microservices(): CellData[] {
  const diagram = new DiagramBuilder()
  const browser = diagram.shape('browser', 40, 255, { element: { name: 'Веб-браузер' } })
  const gateway = diagram.shape('api-gateway', 260, 270, { element: { name: 'API-шлюз' } })
  const [orders, payments, catalog] = [
    { name: 'Сервис заказов', database: 'БД заказов', y: 60 },
    { name: 'Сервис оплаты', database: 'БД оплаты', y: 270 },
    { name: 'Сервис каталога', database: 'БД каталога', y: 480 },
  ].map(({ name, database, y }) => {
    const service = diagram.shape('service', 480, y, { element: { name } })
    const store = diagram.shape('database', 720, y - 15, { element: { name: database, technology: 'PostgreSQL' } })
    diagram.edge(gateway, service, { from: 'right', to: 'left' })
    diagram.edge(service, store, { from: 'right', to: 'left' })
    return service
  }) as [string, string, string]
  const topic = diagram.shape('event-topic', 470, 177, { element: { name: 'Топик «Заказы»', technology: 'Kafka' }, showTechnology: true, width: 140 })
  const kafka = { technology: 'Kafka', interaction: 'async' } as const
  diagram.edge(orders, topic, { value: 'Публикует', ...kafka, from: 'bottom', to: 'top' })
  diagram.edge(topic, payments, { value: 'Читает', ...kafka, from: 'bottom', to: 'top' })
  const cache = diagram.shape('cache', 725, 610, { element: { name: 'Кэш', technology: 'Redis' }, showTechnology: true })
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
  const database = diagram.shape('database', 1120, 215, { value: 'PostgreSQL\n(управляемая)' })
  const storage = diagram.shape('object-storage', 1140, 363, { value: 'Хранилище объектов [S3]' })
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
const OAUTH_LOGIN = `sequenceDiagram
  title Вход через OAuth
  autonumber
  actor User as Пользователь
  participant App as Приложение
  participant Auth as Сервер авторизации
  participant API
  User->>App: Войти
  App-->>User: Перенаправление на сервер авторизации
  User->>Auth: Логин и пароль
  alt Вход удался
    Auth-->>User: Перенаправление с кодом
    User->>App: Код авторизации
    App->>+Auth: Обмен кода на токен
    Auth-->>-App: Токен доступа
    App->>API: Запрос с токеном
    API-->>App: Данные
    App-->>User: Страница
  else Неверный пароль
    Auth-->>User: Ошибка входа
  end`

function oauthLogin(): CellData[] {
  const diagram = parseMermaid(OAUTH_LOGIN)
  if (diagram.kind !== 'sequence') throw new Error('Not a sequence diagram')
  return sequenceCells(diagram.diagram, { x: 40, y: 40 })
}

/** Use cases of an online store: actors, the system boundary and every relation of use cases. */
function useCases(): CellData[] {
  const diagram = new DiagramBuilder()
  // The frame first, so that the use cases are drawn over it.
  diagram.shape('uml-system-boundary', 200, 0, { value: 'Интернет-магазин', width: 520, height: 480 })
  const useCase = (value: string, x: number, y: number) => diagram.shape('uml-use-case', x, y, { value })
  const find = useCase('Найти товар', 240, 50)
  const order = useCase('Оформить заказ', 240, 200)
  const pay = useCase('Оплатить заказ', 240, 350)
  const login = useCase('Войти в систему', 520, 120)
  const coupon = useCase('Применить промокод', 520, 280)
  const actor = (value: string, x: number, y: number) => diagram.shape('uml-actor', x, y, { value })
  const customer = actor('Покупатель', 60, 210)
  const regular = actor('Постоянный покупатель', 60, 400)
  const payments = actor('Платёжная система', 820, 360)
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

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: 'er',
    title: 'ER-диаграмма',
    description: 'Таблицы с полями и связями по внешним ключам',
    build: entityRelationship,
  },
  {
    id: 'c4-containers',
    title: 'C4: контейнеры',
    description: 'Пользователь, контейнеры системы и внешние системы',
    build: c4Containers,
  },
  {
    id: 'microservices',
    title: 'Микросервисы',
    description: 'API-шлюз, сервисы со своими базами, Kafka и Redis',
    build: microservices,
  },
  {
    id: 'kubernetes',
    title: 'Деплой в Kubernetes',
    description: 'CDN, балансировщик, кластер с подами и управляемые сервисы',
    build: kubernetes,
  },
  {
    id: 'oauth-login',
    title: 'Вход через OAuth',
    description: 'Диаграмма последовательности: перенаправление, код, токен и ошибка входа',
    build: oauthLogin,
  },
  {
    id: 'use-cases',
    title: 'Варианты использования',
    description: 'Актёры и варианты использования интернет-магазина: «include», «extend» и обобщение',
    build: useCases,
  },
]

/** The template as the only page of a new board, named after the template. */
export function templatePage(template: BoardTemplate): DrawioPage {
  return { id: null, name: template.title, cells: template.build() }
}
