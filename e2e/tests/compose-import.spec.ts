import { expect, test } from '@playwright/test'
import { cells, createBoard, edges, twoParticipants, userPage, vertices, type CellInfo } from './helpers.ts'

const BASE = `services:
  postgres:
    image: postgres:18-alpine
    networks: [data]
  backend:
    build: ./backend
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/shop
    depends_on: [postgres]
    networks: [data, web]
  frontend:
    image: nginx:1.29
    ports:
      - "\${HTTP_PORT:-8080}:80"
    environment:
      API_URL: http://backend:8080
    networks: [web]
networks:
  data:
  web:
`

/** The file of production adds a cache to the backend and changes the image of the frontend. */
const PROD = `services:
  backend:
    depends_on: [redis]
    networks: [data, web]
  redis:
    image: redis:8
    networks: [data]
  frontend:
    image: nginx:1.29-alpine
`

const POSTGRES = 'postgres\npostgres:18-alpine'
const BACKEND = 'backend\n./backend'
const FRONTEND = 'frontend\nnginx:1.29-alpine\n:8080'
const REDIS = 'redis\nredis:8'

const inside = (frame: CellInfo, shape: CellInfo) =>
  shape.x >= frame.x && shape.y >= frame.y && shape.x + shape.width <= frame.x + frame.width && shape.y + shape.height <= frame.y + frame.height

test('docker-compose files become services, links and networks for everybody, and are undone in one step', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт docker-compose…' }).click()
  await menu.getByLabel('Файлы docker-compose').setInputFiles([
    { name: 'docker-compose.yml', mimeType: 'application/yaml', buffer: Buffer.from(BASE) },
    { name: 'docker-compose.prod.yml', mimeType: 'application/yaml', buffer: Buffer.from(PROD) },
  ])
  await expect(menu.getByRole('status')).toHaveText('Сервисов: 4, связей: 3, сетей: 2')
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()
  await expect(menu).toBeHidden()

  await expect
    .poll(async () => (await vertices(bob)).map((cell) => cell.value).sort())
    .toEqual([BACKEND, FRONTEND, POSTGRES, REDIS, 'data', 'web'].sort())
  const shapes = await vertices(bob)
  const byValue = (value: string) => shapes.find((cell) => cell.value === value)!
  expect(byValue(POSTGRES).style.codrawShape).toBe('database')
  expect(byValue(REDIS).style.codrawShape).toBe('cache')
  expect(byValue(BACKEND).style.codrawShape).toBe('container')
  expect(byValue(FRONTEND).style.codrawShape).toBe('load-balancer')
  // The backend is in the frame of its first network.
  expect(inside(byValue('data'), byValue(BACKEND))).toBe(true)
  expect(inside(byValue('data'), byValue(POSTGRES))).toBe(true)
  expect(inside(byValue('data'), byValue(REDIS))).toBe(true)
  expect(inside(byValue('web'), byValue(FRONTEND))).toBe(true)
  const name = (id: string | null) => shapes.find((cell) => cell.id === id)!.value.split('\n')[0]
  expect((await edges(bob)).map((edge) => `${name(edge.source)} -> ${name(edge.target)}: ${edge.value}`).sort()).toEqual(
    ['backend -> postgres: JDBC', 'backend -> redis: ', 'frontend -> backend: HTTP'].sort(),
  )

  // The services are no tables.
  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  await expect(menu).toContainText('Таблиц на странице: 0')
  await alice.keyboard.press('Escape')

  await alice.getByTestId('diagram-canvas').click({ position: { x: 5, y: 5 } })
  await alice.keyboard.press('Control+z')
  await expect.poll(async () => (await cells(bob)).length).toBe(0)

  await close()
})

test('the window tells where a file is broken and makes shapes of C4 without links of variables', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт docker-compose…' }).click()
  const text = menu.getByRole('textbox', { name: 'docker-compose' })
  await text.fill('services:\n  app:\n   image: a\n    ports: []\n')
  await expect(menu.getByRole('alert')).toHaveText(/^Текст: строка 3, столбец \d+ — /)
  await expect(menu.getByRole('button', { name: 'Добавить на страницу' })).toBeDisabled()

  await text.fill(BASE)
  await menu.getByRole('checkbox', { name: 'Связи по переменным окружения' }).uncheck()
  await menu.getByRole('checkbox', { name: 'Фигуры C4' }).check()
  await expect(menu.getByRole('status')).toHaveText('Сервисов: 3, связей: 1, сетей: 2')
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()

  await expect
    .poll(async () => (await vertices(alice)).filter((cell) => cell.style.codrawShape !== 'boundary').map((cell) => cell.style.codrawShape))
    .toEqual(['c4-database', 'c4-container', 'c4-container'])
  expect((await vertices(alice)).find((cell) => cell.style.codrawShape === 'c4-database')!.value).toBe('postgres\n[Container: postgres:18-alpine]')
  expect((await edges(alice)).map((edge) => edge.value)).toEqual([''])

  await alice.context().close()
})
