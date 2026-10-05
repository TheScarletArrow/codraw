import { expect, test, type Page } from '@playwright/test'
import { twoParticipants } from './helpers.ts'

const USERS = 'CREATE TABLE users (id uuid PRIMARY KEY);\n'
const BOARDS = 'CREATE TABLE boards (id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users (id));\n'

/** Shapes of the page that a segment of an edge goes through, as `edge → shape` by their values. */
function crossings(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    const view = graph.getView()
    const cells = graph.getDefaultParent().getChildren()
    const shapes = cells.filter((cell: any) => cell.isVertex()).map((cell: any) => view.getState(cell))
    const found: string[] = []
    for (const edge of cells.filter((cell: any) => cell.isEdge())) {
      const points = view.getState(edge).absolutePoints
      for (let index = 1; index < points.length; index++) {
        const [a, b] = [points[index - 1], points[index]]
        for (const shape of shapes) {
          const inside =
            Math.min(a.x, b.x) < shape.x + shape.width - 1 &&
            Math.max(a.x, b.x) > shape.x + 1 &&
            Math.min(a.y, b.y) < shape.y + shape.height - 1 &&
            Math.max(a.y, b.y) > shape.y + 1
          if (inside) found.push(`edge → ${shape.cell.getValue()}`)
        }
      }
    }
    return found
  })
}

test('an edge between fields goes around a shape in its way, from the sides of the tables, for everybody', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)

  await alice.getByRole('button', { name: 'SQL и Mermaid' }).click()
  const menu = alice.getByRole('dialog', { name: 'SQL и Mermaid' })
  await menu.getByRole('button', { name: 'Импорт SQL…' }).click()
  await menu.getByLabel('Файлы SQL').setInputFiles([
    { name: 'V1__users.sql', mimeType: 'text/plain', buffer: Buffer.from(USERS) },
    { name: 'V2__boards.sql', mimeType: 'text/plain', buffer: Buffer.from(BOARDS) },
  ])
  await menu.getByRole('button', { name: 'Добавить на страницу' }).click()
  await expect(menu).toBeHidden()

  // The tables move apart, and a shape stands in the middle between the fields of the reference.
  await alice.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const editor = container.__codrawEditor
    const { graph } = editor
    const table = (name: string) => graph.getDefaultParent().getChildren().find((cell: any) => cell.getValue() === name)
    const [boards, users] = [table('boards'), table('users')]
    const moved = users.getGeometry().clone()
    moved.x = boards.getGeometry().x + boards.getGeometry().width + 400
    moved.y = boards.getGeometry().y
    graph.getDataModel().setGeometry(users, moved)
    editor.addShape('rectangle', { x: boards.getGeometry().x + boards.getGeometry().width + 200, y: moved.y + 50 })
  })

  await expect.poll(() => crossings(bob), { timeout: 10_000 }).toEqual([])
  // The edge leaves the right border of `boards` and enters the left border of `users`.
  const ends = await bob.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    const view = graph.getView()
    const cells = graph.getDefaultParent().getChildren()
    const state = (name: string) => view.getState(cells.find((cell: any) => cell.getValue() === name))
    const points = view.getState(cells.find((cell: any) => cell.isEdge())).absolutePoints
    const [boards, users] = [state('boards'), state('users')]
    return { start: points[0].x - (boards.x + boards.width), end: points.at(-1).x - users.x, bends: points.length - 2 }
  })
  expect(Math.abs(ends.start)).toBeLessThan(1)
  expect(Math.abs(ends.end)).toBeLessThan(1)
  expect(ends.bends).toBeGreaterThanOrEqual(2)

  await close()
})
