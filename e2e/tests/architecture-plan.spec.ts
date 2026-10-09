import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, connect, drag, edges, twoParticipants, vertices } from './helpers.ts'

const menu = (page: Page) => page.getByRole('menu', { name: 'Действия' })

/** How the canvas of the page draws a cell: the color of its line, and whether it draws it at all. */
function look(page: Page, id: string): Promise<{ stroke: string; drawn: boolean }> {
  return page.evaluate((cellId) => {
    // Mirrors EDITOR_PROPERTY in frontend/src/diagram/editor.ts.
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    const cell = graph.getDataModel().getCell(cellId)
    return { stroke: String(graph.getCellStyle(cell).strokeColor), drawn: graph.getView().getState(cell) !== null }
  }, id)
}

/** Marks the shape in its menu: «Есть», «Появится» or «Уйдёт». */
async function mark(page: Page, id: string, plan: string) {
  const at = center(await cellBox(page, id))
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await menu(page).getByRole('menuitemradio', { name: plan }).click()
}

test('what will appear and what will go: the difference for everybody, a view for its participant, the target state applied', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const service = await addShape(alice, 'Сервис')
  const database = await addShape(alice, 'База данных')
  const from = center(await cellBox(alice, database))
  await drag(alice, from, { x: from.x, y: from.y + 200 })
  await connect(alice, service, database)
  await expect.poll(async () => (await edges(alice)).length).toBe(1)

  // Алиса plans a new service instead of the database: Боб sees the difference too.
  await mark(alice, service, 'Появится')
  await mark(alice, database, 'Уйдёт')
  await expect.poll(async () => (await look(bob, service)).stroke).toBe('#16a34a')
  await expect.poll(async () => (await look(bob, database)).stroke).toBe('#dc2626')

  // «Как есть» is the view of Алиса alone, and her address keeps it.
  await alice.getByRole('button', { name: 'Как есть и как будет' }).click()
  await alice.getByRole('radio', { name: 'Как есть' }).check()
  await expect.poll(async () => (await look(alice, service)).drawn).toBe(false)
  expect((await look(alice, database)).stroke).not.toBe('#dc2626')
  expect((await look(bob, service)).drawn).toBe(true)
  await expect(alice).toHaveURL(/view=current/)

  // The target state: the database goes with its edge, the service is as it is, for both.
  await alice.getByRole('button', { name: 'Применить целевое состояние' }).click()
  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.id)).toEqual([service])
  expect(await edges(bob)).toEqual([])
  await expect.poll(async () => (await look(bob, service)).stroke).not.toBe('#16a34a')
  await expect.poll(async () => (await look(alice, service)).drawn).toBe(true)

  // One undo step brings the plan back.
  await alice.keyboard.press('Escape')
  await alice.getByRole('button', { name: 'Отменить' }).click()
  await expect.poll(async () => (await vertices(bob)).length).toBe(2)
  await expect.poll(async () => (await look(bob, database)).stroke).toBe('#dc2626')

  await close()
})
