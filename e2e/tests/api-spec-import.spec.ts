import { expect, test, type Page } from '@playwright/test'
import { cells, edges, twoParticipants, userPage, createBoard, vertices, type CellInfo } from './helpers.ts'

const PETSTORE = `openapi: 3.0.3
info:
  title: Petstore
  version: 1.0.0
paths:
  /pets:
    get:
      responses:
        '200':
          description: The pets
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Pet'
    post:
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Pet'
      responses:
        '201':
          description: Created
components:
  schemas:
    Pet:
      type: object
      required: [id, name]
      properties:
        id:
          type: integer
          format: int64
        name:
          type: string
        category:
          $ref: '#/components/schemas/Category'
    Category:
      type: object
      properties:
        name:
          type: string
`

const ORDERS = `asyncapi: 3.0.0
info:
  title: Orders
  version: 1.0.0
channels:
  orderCreated:
    address: orders.created
    messages:
      OrderCreated:
        payload:
          type: object
          properties:
            orderId:
              type: string
operations:
  publishOrderCreated:
    action: send
    channel:
      $ref: '#/channels/orderCreated'
`

/** AsyncAPI 2 in JSON: `publish` is what Billing receives. */
const BILLING = JSON.stringify({
  asyncapi: '2.6.0',
  info: { title: 'Billing', version: '1.0.0' },
  channels: { 'orders.created': { publish: { message: { name: 'OrderCreated' } } } },
})

const SERVICE = 'Petstore\nGET /pets\nPOST /pets'

/** The value of the cell of an end of an edge: a shape, or the table of a field as `table.field`. */
function endName(page: Page, id: string | null) {
  return page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const cell = container.__codrawEditor.graph.getDataModel().getCell(id)
    const parent = cell.getParent()
    return parent.getParent()?.getParent() ? `${parent.getValue()}.${cell.getValue()}` : String(cell.getValue())
  }, id)
}

const links = async (page: Page) =>
  Promise.all((await edges(page)).map(async (edge: CellInfo) => [await endName(page, edge.source), await endName(page, edge.target), edge.value]))

test('OpenAPI and AsyncAPI files become services, a topic and tables for everybody, and are undone in one step', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт OpenAPI / AsyncAPI…' }).click()
  await menu.getByLabel('Файлы OpenAPI и AsyncAPI').setInputFiles([
    { name: 'petstore.yaml', mimeType: 'application/yaml', buffer: Buffer.from(PETSTORE) },
    { name: 'orders.yaml', mimeType: 'application/yaml', buffer: Buffer.from(ORDERS) },
    { name: 'billing.json', mimeType: 'application/json', buffer: Buffer.from(BILLING) },
  ])
  await expect(menu.getByRole('status')).toHaveText('Сервисов: 3, эндпоинтов: 2, топиков: 1, моделей: 3, связей: 5, пропущено ссылок: 0')
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()
  await expect(menu).toBeHidden()

  await expect
    .poll(async () => (await vertices(bob)).map((cell) => cell.value).sort())
    .toEqual(['Billing', 'Category', 'OrderCreated', 'Orders', 'Pet', SERVICE, 'orders.created'].sort())
  const shapes = await vertices(bob)
  const byValue = (value: string) => shapes.find((cell) => cell.value === value)!
  expect(byValue(SERVICE).style).toMatchObject({ codrawShape: 'service', align: 'left' })
  expect(byValue(SERVICE).style).not.toHaveProperty('childLayout')
  expect(byValue('orders.created').style.codrawShape).toBe('event-topic')
  expect(byValue('Pet').style.childLayout).toBe('stackLayout')
  expect((await links(bob)).sort()).toEqual(
    [
      ['Orders', 'orders.created', 'OrderCreated'],
      ['orders.created', 'Billing', 'OrderCreated'],
      ['orders.created', 'OrderCreated', ''],
      ['Pet.category Category', 'Category', ''],
      [SERVICE, 'Pet', ''],
    ].sort(),
  )
  // The sender is left of the topic, the receiver right of it.
  expect(byValue('Orders').x + byValue('Orders').width).toBeLessThanOrEqual(byValue('orders.created').x)
  expect(byValue('orders.created').x + byValue('orders.created').width).toBeLessThanOrEqual(byValue('Billing').x)

  // The service is no table: «Скопировать SQL» has the models only.
  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  await expect(menu).toContainText('Таблиц на странице: 3')
  await alice.keyboard.press('Escape')

  await alice.getByTestId('diagram-canvas').click({ position: { x: 5, y: 5 } })
  await alice.keyboard.press('Control+z')
  await expect.poll(async () => (await cells(bob)).length).toBe(0)

  await close()
})

test('the window tells where a document is broken and adds no models without «Модели таблицами»', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт OpenAPI / AsyncAPI…' }).click()
  const text = menu.getByRole('textbox', { name: 'OpenAPI или AsyncAPI' })
  await text.fill('openapi: 3.0.3\ninfo:\n  title: Petstore\n version: 1.0.0\n')
  await expect(menu.getByRole('alert')).toHaveText(/^Текст: строка 4, столбец \d+ — /)
  await expect(menu.getByRole('button', { name: 'Добавить на страницу' })).toBeDisabled()

  await text.fill(PETSTORE)
  await menu.getByRole('checkbox', { name: 'Модели таблицами' }).uncheck()
  await expect(menu.getByRole('status')).toHaveText('Сервисов: 1, эндпоинтов: 2, топиков: 0, моделей: 0, связей: 0, пропущено ссылок: 0')
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()

  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.value)).toEqual([SERVICE])

  await alice.context().close()
})
