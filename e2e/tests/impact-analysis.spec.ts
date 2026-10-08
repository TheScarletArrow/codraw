import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, connect, drag, edges, twoParticipants } from './helpers.ts'

const menu = (page: Page) => page.getByRole('menu', { name: 'Действия' })

/** The color of the line of a cell as the canvas of the page draws it, and its opacity. */
function look(page: Page, id: string): Promise<{ stroke: string; opacity: number }> {
  return page.evaluate((cellId) => {
    // Mirrors EDITOR_PROPERTY in frontend/src/diagram/editor.ts.
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    const style = graph.getCellStyle(graph.getDataModel().getCell(cellId))
    return { stroke: String(style.strokeColor), opacity: style.opacity ?? 100 }
  }, id)
}

test('the dependencies of an element and the path between two, for their participant alone', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  // Веб-браузер → Сервис → База данных, laid out from left to right.
  const web = await addShape(alice, 'Веб-браузер')
  const api = await addShape(alice, 'Сервис')
  const db = await addShape(alice, 'База данных')
  for (const [id, dx] of [
    [web, -300],
    [db, 300],
  ] as const) {
    const box = await cellBox(alice, id)
    await drag(alice, { x: box.x + 20, y: box.y + box.height - 15 }, { x: box.x + 20 + dx, y: box.y + box.height - 15 })
  }
  await connect(alice, web, api)
  await connect(alice, api, db)
  await expect.poll(async () => (await edges(alice)).length).toBe(2)

  // The dependencies of the service: the database blue, the browser orange.
  const at = center(await cellBox(alice, api))
  await alice.mouse.click(at.x, at.y, { button: 'right' })
  await menu(alice).getByRole('menuitem', { name: 'Зависимости' }).click()
  const panel = alice.getByRole('complementary', { name: 'Зависимости' })
  await expect(panel.getByRole('region', { name: 'Зависит от' })).toContainText('База данных')
  await expect(panel.getByRole('region', { name: 'Зависят от него' })).toContainText('Веб-браузер')
  expect((await look(alice, db)).stroke).toBe('#2563eb')
  expect((await look(alice, web)).stroke).toBe('#ea580c')
  expect((await look(bob, db)).stroke).not.toBe('#2563eb')

  // Escape ends it.
  await alice.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  expect((await look(alice, db)).stroke).not.toBe('#2563eb')

  // The path between the browser and the database goes through the service.
  await alice.mouse.click(...(Object.values(center(await cellBox(alice, web))) as [number, number]))
  const end = center(await cellBox(alice, db))
  await alice.keyboard.down('Shift')
  await alice.mouse.click(end.x, end.y)
  await alice.keyboard.up('Shift')
  await alice.mouse.click(end.x, end.y, { button: 'right' })
  await menu(alice).getByRole('menuitem', { name: 'Путь между' }).click()
  const path = alice.getByRole('complementary', { name: 'Путь между' })
  await expect(path).toContainText('2 шага')
  expect((await look(alice, api)).stroke).toBe('#16a34a')

  await close()
})
