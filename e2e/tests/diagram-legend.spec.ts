import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, connect, createBoard, drag, twoParticipants, userPage, vertices } from './helpers.ts'

const panel = (page: Page) => page.getByRole('complementary', { name: 'Свойства' })
const menu = (page: Page) => page.getByRole('menu', { name: 'Действия' })

/** Adds a legend from the palette: the first of its two sections. */
async function addLegend(page: Page): Promise<string> {
  const before = new Set((await vertices(page)).map((cell) => cell.id))
  await page.getByRole('complementary', { name: 'Фигуры' }).getByRole('button', { name: 'Легенда', exact: true }).first().click()
  await expect.poll(async () => (await vertices(page)).length).toBe(before.size + 1)
  return (await vertices(page)).find((cell) => !before.has(cell.id))!.id
}

/** The names of the rows of the legend of the page as the canvas draws them; `null` without a legend. */
function legendRows(page: Page): Promise<string[] | null> {
  return page.evaluate(() => {
    // Mirrors EDITOR_PROPERTY in frontend/src/diagram/editor.ts.
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    const legend = graph
      .getDefaultParent()
      .getChildren()
      .find((cell: any) => cell.getStyle().shape === 'codraw.legend')
    if (!legend) return null
    const node = graph.getView().getState(legend)?.shape?.node as Element | undefined
    return node ? Array.from(node.querySelectorAll('text'), (text) => text.textContent ?? '') : []
  })
}

/** Moves a shape by dragging it by a point near its top-left corner. */
async function move(page: Page, id: string, dx: number, dy: number) {
  const box = await cellBox(page, id)
  await drag(page, { x: box.x + 15, y: box.y + 10 }, { x: box.x + 15 + dx, y: box.y + 10 + dy })
}

test('a legend lists the page for both participants, follows an edge of another, renames and hides items, undo', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const service = await addShape(alice, 'Сервис')
  const database = await addShape(alice, 'База данных')
  await move(alice, database, 250, 0)
  const legend = await addLegend(alice)
  await move(alice, legend, 0, 250)
  await expect.poll(() => legendRows(alice)).toEqual(['Сервис', 'База данных'])
  await expect.poll(() => legendRows(bob)).toEqual(['Сервис', 'База данных'])

  // Боб draws an edge: the legend of Алиса gets it.
  await expect.poll(async () => (await vertices(bob)).length).toBe(3)
  await connect(bob, service, database)
  await expect.poll(() => legendRows(alice)).toEqual(['Сервис', 'База данных', 'Связь'])

  // Алиса names the edge and hides the database in the panel of the legend; Боб sees it.
  const at = center(await cellBox(alice, legend))
  await alice.mouse.click(at.x, at.y, { button: 'right' })
  await menu(alice).getByRole('menuitem', { name: 'Свойства…' }).click()
  await expect(panel(alice).getByRole('heading')).toHaveText('Легенда')
  await panel(alice).getByLabel('Имя пункта «Связь»').fill('Синхронный вызов')
  await panel(alice).getByLabel('Имя пункта «Связь»').press('Enter')
  await expect.poll(() => legendRows(bob)).toEqual(['Сервис', 'База данных', 'Синхронный вызов'])
  await panel(alice).getByRole('button', { name: 'Скрыть «База данных»' }).click()
  await expect.poll(() => legendRows(bob)).toEqual(['Сервис', 'Синхронный вызов'])
  await expect(panel(alice).getByRole('button', { name: 'Показать «База данных»' })).toBeVisible()

  // Hiding is one undo step of Алиса.
  await alice.getByTestId('diagram-canvas').focus()
  await alice.keyboard.press('Control+z')
  await expect.poll(() => legendRows(bob)).toEqual(['Сервис', 'База данных', 'Синхронный вызов'])

  await close()
})

test('a legend goes to .drawio as a frame with samples and names, and comes back a legend', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  await addShape(alice, 'Сервис')
  const legend = await addLegend(alice)
  await move(alice, legend, 0, 250)
  const at = center(await cellBox(alice, legend))
  await alice.mouse.click(at.x, at.y)
  await alice.getByRole('button', { name: 'Свойства', exact: true }).click()
  await panel(alice).getByLabel('Имя пункта «Сервис»').fill('API')
  await panel(alice).getByLabel('Имя пункта «Сервис»').press('Enter')
  await expect.poll(() => legendRows(alice)).toEqual(['API'])

  const download = alice.waitForEvent('download')
  await alice.getByRole('button', { name: 'Экспорт в .drawio' }).click()
  const xml = await readFile((await (await download).path())!, 'utf8')
  expect(xml).toContain('codrawShape=legend')
  expect(xml).toContain('codrawLegendPart=1')
  expect(xml).toContain('value="API"')
  expect(xml).not.toContain('codraw.legend')

  // Another user opens the file as a board of their own: one service and the legend, which lists it itself.
  const eve = await userPage(browser, 'Ева')
  await eve.goto('/')
  await eve.getByLabel('Файл draw.io').setInputFiles({ name: 'Легенда.drawio', mimeType: 'application/vnd.jgraph.mxfile', buffer: Buffer.from(xml) })
  await expect(eve.getByRole('status')).toHaveText('Синхронизировано')
  await expect.poll(() => legendRows(eve)).toEqual(['API'])
  expect(await vertices(eve)).toHaveLength(2)

  await Promise.all([alice.context().close(), eve.context().close()])
})
