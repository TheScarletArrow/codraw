import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, createBoard, drag, twoParticipants, userPage } from './helpers.ts'

const panel = (page: Page) => page.getByRole('complementary', { name: 'Слои' })
const row = (page: Page, name: string) => panel(page).getByRole('listitem', { name, exact: true })

/** Opens the panel of layers from the header of the board. */
async function openLayers(page: Page) {
  await page.getByRole('button', { name: 'Слои', exact: true }).click()
  await expect(panel(page)).toBeVisible()
}

/** Runs an item of the menu of a layer. */
async function layerAction(page: Page, layer: string, item: string) {
  await panel(page).getByRole('button', { name: `Действия со слоем «${layer}»` }).click()
  await page.getByRole('menu', { name: `Слой «${layer}»` }).getByRole('menuitem', { name: item }).click()
}

/** The name of the layer of a cell as the document keeps it (`''` for the main layer), and whether the canvas shows it. */
function layerOf(page: Page, id: string): Promise<{ layer: string | null; shown: boolean }> {
  return page.evaluate((id) => {
    // Mirrors EDITOR_PROPERTY in frontend/src/diagram/editor.ts.
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    const root = graph.getDataModel().getRoot()
    let cell = graph.getDataModel().getCell(id)
    const state = cell ? graph.getView().getState(cell) : null
    while (cell && cell.getParent() !== root) cell = cell.getParent()
    return { layer: cell ? String(cell.getValue() ?? '') : null, shown: !!state }
  }, id)
}

/** Ids of the selected cells. */
const selected = (page: Page) =>
  page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    return container.__codrawEditor.graph.getSelectionCells().map((cell: any) => cell.getId() as string)
  })

/** Moves a shape by dragging it by a point near its top-left corner. */
async function move(page: Page, id: string, dx: number, dy: number) {
  const box = await cellBox(page, id)
  await drag(page, { x: box.x + 15, y: box.y + 10 }, { x: box.x + 15 + dx, y: box.y + 10 + dy })
}

test('layers: a new layer for both participants, new shapes in it, moving the selection, own and shared visibility, lock, undo', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const service = await addShape(alice, 'Сервис')
  await openLayers(alice)
  await openLayers(bob)
  await expect(row(alice, 'Основной слой')).toHaveAttribute('aria-current', 'true')

  // Алиса adds a layer, names it and adds a database: it goes into the new layer, and Боб sees the layer.
  await panel(alice).getByRole('button', { name: 'Новый слой' }).click()
  await panel(alice).getByRole('textbox', { name: 'Имя слоя' }).fill('Инфраструктура')
  await panel(alice).getByRole('textbox', { name: 'Имя слоя' }).press('Enter')
  await expect(row(bob, 'Инфраструктура')).toBeVisible()
  await expect(row(alice, 'Инфраструктура')).toHaveAttribute('aria-current', 'true')
  // The active layer is her own: Боб still adds into the main layer.
  await expect(row(bob, 'Основной слой')).toHaveAttribute('aria-current', 'true')
  const database = await addShape(alice, 'База данных')
  // Away from the panels at the right of the canvas.
  await move(alice, database, -250, 0)
  await expect.poll(async () => (await layerOf(bob, database)).layer).toBe('Инфраструктура')

  // She moves the service there too, at its place.
  const before = await cellBox(alice, service)
  await alice.mouse.click(center(before).x, center(before).y)
  await layerAction(alice, 'Инфраструктура', 'Перенести выделенное сюда')
  await expect.poll(async () => (await layerOf(bob, service)).layer).toBe('Инфраструктура')
  expect(await cellBox(alice, service)).toEqual(before)
  await expect(row(alice, 'Инфраструктура').getByTitle('Элементов в слое')).toHaveText('2')

  // Hidden for herself: Боб still sees the layer.
  await panel(alice).getByRole('button', { name: 'Скрыть у себя «Инфраструктура»' }).click()
  await expect.poll(async () => (await layerOf(alice, database)).shown).toBe(false)
  await expect(row(alice, 'Инфраструктура')).toContainText('скрыт только у вас')
  expect((await layerOf(bob, database)).shown).toBe(true)
  await panel(alice).getByRole('button', { name: 'Показать у себя «Инфраструктура»' }).click()
  await expect.poll(async () => (await layerOf(alice, database)).shown).toBe(true)

  // Hidden for everybody: Боб does not see it, until Алиса undoes it.
  await layerAction(alice, 'Инфраструктура', 'Скрыть для всех')
  await expect.poll(async () => (await layerOf(bob, database)).shown).toBe(false)
  await expect(row(bob, 'Инфраструктура')).toContainText('скрыт для всех')
  await alice.getByTestId('diagram-canvas').focus()
  await alice.keyboard.press('Control+z')
  await expect.poll(async () => (await layerOf(bob, database)).shown).toBe(true)

  // Locked by Алиса: a click of Боб on the database selects nothing, and he cannot drag it.
  await panel(alice).getByRole('button', { name: 'Заблокировать «Инфраструктура»' }).click()
  await expect(row(bob, 'Инфраструктура')).toContainText('заблокировал Алиса')
  const locked = await cellBox(bob, database)
  await bob.mouse.click(center(locked).x, center(locked).y)
  expect(await selected(bob)).toEqual([])
  await move(bob, database, 0, 150)
  expect(await cellBox(bob, database)).toEqual(locked)
  await panel(alice).getByRole('button', { name: 'Разблокировать «Инфраструктура»' }).click()
  await expect(panel(bob).getByRole('button', { name: 'Заблокировать «Инфраструктура»' })).toBeVisible()
  await bob.mouse.click(center(locked).x, center(locked).y)
  await expect.poll(() => selected(bob)).toEqual([database])

  // Removing the layer moves its shapes into the main layer, for both.
  await layerAction(alice, 'Инфраструктура', 'Удалить слой')
  await alice.getByRole('alertdialog', { name: 'Удаление слоя' }).getByRole('button', { name: 'Перенести в «Основной слой» и удалить слой' }).click()
  await expect(row(bob, 'Инфраструктура')).toHaveCount(0)
  await expect.poll(async () => (await layerOf(bob, database)).layer).toBe('')

  await close()
})

test('layers go to .drawio as layers of draw.io, hidden and locked, and come back as layers', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  await addShape(alice, 'Сервис')
  await openLayers(alice)
  await panel(alice).getByRole('button', { name: 'Новый слой' }).click()
  await panel(alice).getByRole('textbox', { name: 'Имя слоя' }).fill('Заметки')
  await panel(alice).getByRole('textbox', { name: 'Имя слоя' }).press('Enter')
  const note = await addShape(alice, 'Стикер')
  await move(alice, note, -250, 0)
  await layerAction(alice, 'Заметки', 'Скрыть для всех')
  await panel(alice).getByRole('button', { name: 'Заблокировать «Заметки»' }).click()

  const download = alice.waitForEvent('download')
  await alice.getByRole('button', { name: 'Экспорт в .drawio' }).click()
  const xml = await readFile((await (await download).path())!, 'utf8')
  expect(xml).toMatch(/<mxCell id="[^"]+" value="Заметки" style="locked=1;" parent="0" visible="0"\/>/)
  expect(xml).not.toContain('codrawHidden')

  // Another user opens the file as a board of their own: the layer is there, hidden for everybody and locked.
  const eve = await userPage(browser, 'Ева')
  await eve.goto('/')
  await eve.getByLabel('Файл draw.io').setInputFiles({ name: 'Слои.drawio', mimeType: 'application/vnd.jgraph.mxfile', buffer: Buffer.from(xml) })
  await expect(eve.getByRole('status')).toHaveText('Синхронизировано')
  await openLayers(eve)
  await expect(row(eve, 'Заметки')).toContainText('скрыт для всех')
  await expect(panel(eve).getByRole('button', { name: 'Разблокировать «Заметки»' })).toBeVisible()
  await expect.poll(async () => (await layerOf(eve, note)).shown).toBe(false)

  await Promise.all([alice.context().close(), eve.context().close()])
})
