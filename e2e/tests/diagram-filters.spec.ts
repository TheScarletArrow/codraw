import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, createBoard, drag, twoParticipants, userPage } from './helpers.ts'

const panel = (page: Page) => page.getByRole('complementary', { name: 'Свойства' })
const filterWindow = (page: Page) => page.getByRole('dialog', { name: 'Фильтр' })

/** What the filter of the canvas does to a cell: its opacity as drawn and whether it is drawn at all. */
function look(page: Page, id: string): Promise<{ opacity: number; drawn: boolean }> {
  return page.evaluate((cellId) => {
    // Mirrors EDITOR_PROPERTY in frontend/src/diagram/editor.ts.
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    const cell = graph.getDataModel().getCell(cellId)
    return { opacity: graph.getCellStyle(cell).opacity ?? 100, drawn: graph.getView().getState(cell) !== null }
  }, id)
}

/** Gives the shape named `name` an owner in the panel of properties, once the panel shows the shape. */
async function setOwner(page: Page, id: string, name: string, owner: string) {
  const at = center(await cellBox(page, id))
  await page.mouse.click(at.x, at.y)
  await expect(panel(page).getByLabel('Имя', { exact: true })).toHaveValue(name)
  await panel(page).getByLabel('Владелец').fill(owner)
  await panel(page).getByLabel('Владелец').press('Enter')
}

test('a filter by owner dims and hides the others for its participant alone, and a link opens the same slice', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const payments = await addShape(alice, 'Сервис')
  const stock = await addShape(alice, 'База данных')
  // Below the service, not at the right of it, where the panel of properties covers it.
  const box = await cellBox(alice, stock)
  await drag(alice, { x: box.x + 20, y: box.y + 30 }, { x: box.x + 20, y: box.y + 230 })
  await alice.getByRole('button', { name: 'Свойства', exact: true }).click()
  await setOwner(alice, payments, 'Сервис', 'Платежи')
  await setOwner(alice, stock, 'База данных', 'Склад')

  // Алиса shows the payments team: the warehouse goes pale for her only.
  await alice.getByRole('button', { name: 'Фильтр' }).click()
  await filterWindow(alice).getByRole('checkbox', { name: 'Платежи' }).check()
  await expect(filterWindow(alice)).toContainText('Подходит 1 из 2')
  await expect.poll(async () => (await look(alice, stock)).opacity).toBe(25)
  expect((await look(alice, payments)).opacity).toBe(100)
  await expect.poll(async () => (await look(bob, stock)).opacity).toBe(100)
  await expect(alice.getByRole('button', { name: 'Фильтр' })).toHaveAttribute('aria-pressed', 'true')

  // Hidden, the warehouse is not drawn at all; Боб still has it.
  await filterWindow(alice).getByRole('checkbox', { name: 'Скрывать неподходящее' }).check()
  await expect.poll(async () => (await look(alice, stock)).drawn).toBe(false)
  expect((await look(bob, stock)).drawn).toBe(true)

  // The address keeps the slice: Боб opens the link of Алиса and sees the same.
  await expect(alice).toHaveURL(/owner=/)
  await bob.goto(alice.url())
  await expect(bob.getByRole('status')).toHaveText('Синхронизировано')
  await expect.poll(async () => (await look(bob, stock)).drawn).toBe(false)
  expect((await look(bob, payments)).drawn).toBe(true)

  await close()
})

test('«Только видимое» saves the slice of the filter as an image', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  const payments = await addShape(alice, 'Сервис')
  const stock = await addShape(alice, 'База данных')
  const box = await cellBox(alice, stock)
  await drag(alice, { x: box.x + 20, y: box.y + 30 }, { x: box.x + 20, y: box.y + 230 })
  await alice.getByRole('button', { name: 'Свойства', exact: true }).click()
  await setOwner(alice, payments, 'Сервис', 'Платежи')
  await setOwner(alice, stock, 'База данных', 'Склад')
  await alice.getByRole('button', { name: 'Фильтр' }).click()
  await filterWindow(alice).getByRole('checkbox', { name: 'Склад' }).check()
  await alice.keyboard.press('Escape')

  await alice.getByRole('button', { name: 'Экспорт в изображение' }).click()
  await alice.getByRole('checkbox', { name: 'Только видимое' }).check()
  const download = alice.waitForEvent('download')
  await alice.getByRole('button', { name: 'Сохранить SVG' }).click()
  const svg = await readFile((await (await download).path())!, 'utf8')
  expect(svg).toContain('База данных')
  expect(svg).not.toContain('>Сервис<')

  await alice.context().close()
})
