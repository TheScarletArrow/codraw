import { expect, test } from '@playwright/test'
import { cells, twoParticipants, userPage, createBoard, vertices, type CellInfo } from './helpers.ts'

const FLOWCHART = `flowchart TD
  lb[Балансировщик] -->|HTTPS| api
  subgraph k8s [Кластер]
    api(API) --> db[(PostgreSQL)]
  end
  style lb fill:#fff`

const ER = `erDiagram
  CUSTOMER ||--o{ ORDER : places
  CUSTOMER {
    int id PK
    string email UK
  }
  ORDER {
    int id PK
    int customer_id FK
  }`

const holds = (frame: CellInfo, cell: CellInfo) =>
  cell.x >= frame.x && cell.y >= frame.y && cell.x + cell.width <= frame.x + frame.width && cell.y + cell.height <= frame.y + frame.height

test('a flowchart of Mermaid pasted on the canvas becomes shapes in a frame for everybody, in one undo step', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  await alice.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await alice.evaluate((text) => navigator.clipboard.writeText(text), FLOWCHART)

  await alice.getByTestId('diagram-canvas').click({ position: { x: 5, y: 5 } })
  await alice.keyboard.press('Control+v')

  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.value).sort()).toEqual([
    'API',
    'PostgreSQL',
    'Балансировщик',
    'Кластер',
  ])
  const shapes = await vertices(bob)
  const byValue = (value: string) => shapes.find((cell) => cell.value === value)!
  expect(byValue('API').style.codrawShape).toBe('rounded')
  expect(byValue('PostgreSQL').style.codrawShape).toBe('database')
  expect(holds(byValue('Кластер'), byValue('API'))).toBe(true)
  expect(holds(byValue('Кластер'), byValue('PostgreSQL'))).toBe(true)
  expect(holds(byValue('Кластер'), byValue('Балансировщик'))).toBe(false)
  const edges = (await cells(bob)).filter((cell) => cell.kind === 'edge')
  expect(edges.map((edge) => [byValueOf(shapes, edge.source), byValueOf(shapes, edge.target), edge.value])).toEqual([
    ['Балансировщик', 'API', 'HTTPS'],
    ['API', 'PostgreSQL', ''],
  ])

  await alice.keyboard.press('Control+z')
  await expect.poll(async () => (await cells(bob)).length).toBe(0)

  await close()
})

const byValueOf = (shapes: CellInfo[], id: string | null) => shapes.find((cell) => cell.id === id)?.value

test('an ER diagram of Mermaid imported from the menu becomes tables with a reference between their fields', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт Mermaid…' }).click()
  await menu.getByRole('textbox', { name: 'Mermaid' }).fill(ER)
  await expect(menu.getByRole('status')).toHaveText('Таблиц: 2, связей: 1, пропущено строк: 0')
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()

  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.value).sort()).toEqual(['CUSTOMER', 'ORDER'])
  const reference = await alice.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const edge = container.__codrawEditor.graph
      .getDefaultParent()
      .getChildren()
      .find((cell: any) => cell.isEdge())
    return [edge.getTerminal(true).getValue(), edge.getTerminal(false).getValue(), edge.getTerminal(false).getParent().getValue()]
  })
  expect(reference).toEqual(['customer_id int FK NOT NULL', 'id int PK', 'CUSTOMER'])

  await alice.context().close()
})
