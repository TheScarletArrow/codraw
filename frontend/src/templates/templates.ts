import type { CellData } from '../diagram/model.ts'
import type { DrawioPage } from '../drawio/parse.ts'
import { DiagramBuilder } from './builder.ts'

export type TemplateId = 'er' | 'c4-containers' | 'microservices' | 'kubernetes'

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
  diagram.shape('c4-boundary', 40, 240, { value: 'Интернет-магазин\n[Software System]', width: 1000, height: 220 })
  const customer = diagram.shape('c4-person', 440, 0, { value: 'Покупатель\n[Person]\nВыбирает и оплачивает товары' })
  const web = diagram.shape('c4-container', 80, 300, {
    value: 'Веб-приложение\n[Container: React]\nКаталог, корзина и оформление заказа',
  })
  const api = diagram.shape('c4-container', 420, 300, { value: 'API\n[Container: Spring Boot]\nЗаказы, оплата и каталог' })
  const database = diagram.shape('c4-database', 760, 300, {
    value: 'База данных\n[Container: PostgreSQL]\nТовары, заказы и покупатели',
  })
  const payments = diagram.shape('c4-external-system', 420, 540, {
    value: 'Платёжный шлюз\n[Software System]\nПринимает оплату картой',
  })
  diagram.edge(customer, web, { value: 'Использует\n[HTTPS]', from: 'left', to: 'top' })
  diagram.edge(web, api, { value: 'Вызывает\n[JSON/HTTPS]', from: 'right', to: 'left' })
  diagram.edge(api, database, { value: 'Читает и пишет\n[JDBC]', from: 'right', to: 'left' })
  diagram.edge(api, payments, { value: 'Проводит оплату\n[HTTPS]', from: 'bottom', to: 'top' })
  return diagram.build()
}

function microservices(): CellData[] {
  const diagram = new DiagramBuilder()
  const browser = diagram.shape('browser', 40, 255)
  const gateway = diagram.shape('api-gateway', 260, 270)
  const [orders, payments, catalog] = [
    { name: 'Сервис заказов', database: 'БД заказов', y: 60 },
    { name: 'Сервис оплаты', database: 'БД оплаты', y: 270 },
    { name: 'Сервис каталога', database: 'БД каталога', y: 480 },
  ].map(({ name, database, y }) => {
    const service = diagram.shape('service', 480, y, { value: name })
    const store = diagram.shape('database', 720, y - 15, { value: database })
    diagram.edge(gateway, service, { from: 'right', to: 'left' })
    diagram.edge(service, store, { from: 'right', to: 'left' })
    return service
  }) as [string, string, string]
  const topic = diagram.shape('event-topic', 470, 177, { value: 'Топик «Заказы» [Kafka]', width: 140 })
  diagram.edge(orders, topic, { value: 'Публикует', from: 'bottom', to: 'top' })
  diagram.edge(topic, payments, { value: 'Читает', from: 'bottom', to: 'top' })
  const cache = diagram.shape('cache', 725, 610, { value: 'Кэш [Redis]' })
  diagram.edge(catalog, cache, { from: 'bottom', to: 'left' })
  diagram.edge(browser, gateway, { value: 'HTTPS', from: 'right', to: 'left' })
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
]

/** The template as the only page of a new board, named after the template. */
export function templatePage(template: BoardTemplate): DrawioPage {
  return { id: null, name: template.title, cells: template.build() }
}
