import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, createBoard, twoParticipants, userPage, vertices } from './helpers.ts'

const panel = (page: Page) => page.getByRole('complementary', { name: 'Свойства' })
const menu = (page: Page) => page.getByRole('menu', { name: 'Действия' })
const label = async (page: Page, id: string) => (await vertices(page)).find((cell) => cell.id === id)?.value

/** Selects a shape with a click in its middle. */
async function select(page: Page, id: string) {
  const at = center(await cellBox(page, id))
  await page.mouse.click(at.x, at.y)
}

test('properties of an element: the panel from the menu, the label of C4 made of them, another participant, undo', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const api = await addShape(alice, 'Container')

  // Алиса opens the properties from the menu of the container and gives it a technology and an owner.
  const at = center(await cellBox(alice, api))
  await alice.mouse.click(at.x, at.y, { button: 'right' })
  await menu(alice).getByRole('menuitem', { name: 'Свойства…' }).click()
  await expect(panel(alice).getByLabel('Имя')).toHaveValue('Контейнер')
  await expect(panel(alice).getByLabel('Тип')).toHaveValue('c4-container')
  await panel(alice).getByLabel('Технология').fill('Go')
  await panel(alice).getByLabel('Технология').press('Enter')
  await panel(alice).getByLabel('Владелец').fill('Команда заказов')
  await panel(alice).getByLabel('Владелец').press('Enter')
  await expect.poll(() => label(alice, api)).toBe('Контейнер\n[Container: Go]')

  // Боб sees the label and the properties on his canvas.
  await expect.poll(() => label(bob, api)).toBe('Контейнер\n[Container: Go]')
  await bob.getByRole('button', { name: 'Свойства', exact: true }).click()
  await expect(panel(bob)).toContainText('Выделите фигуру или связь')
  await select(bob, api)
  await expect(panel(bob).getByLabel('Технология')).toHaveValue('Go')
  await expect(panel(bob).getByLabel('Владелец')).toHaveValue('Команда заказов')

  // The owner is one undo step of Алиса; the technology stays.
  await alice.locator('[data-testid=diagram-canvas]').focus()
  await alice.keyboard.press('Control+z')
  await expect(panel(bob).getByLabel('Владелец')).toHaveValue('')
  await expect(panel(bob).getByLabel('Технология')).toHaveValue('Go')

  await close()
})

test('properties go through a file of draw.io as attributes and a label of placeholders', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  const api = await addShape(alice, 'Container')
  await select(alice, api)
  await alice.getByRole('button', { name: 'Свойства', exact: true }).click()
  await panel(alice).getByLabel('Технология').fill('Spring Boot')
  await panel(alice).getByLabel('Технология').press('Enter')
  await panel(alice).getByLabel('Теги').fill('core pci')
  await panel(alice).getByLabel('Теги').press('Enter')
  await expect.poll(() => label(alice, api)).toBe('Контейнер\n[Container: Spring Boot]')

  const download = alice.waitForEvent('download')
  await alice.getByRole('button', { name: 'Экспорт в .drawio' }).click()
  const file = await download
  const xml = await readFile((await file.path())!, 'utf8')
  expect(xml).toContain('placeholders="1"')
  expect(xml).toContain('label="%name%&#xa;[Container: %technology%]"')
  expect(xml).toContain('technology="Spring Boot"')
  expect(xml).toContain('tags="core pci"')

  // Another user opens the file as a board of their own: the shape has the same label and properties.
  const eve = await userPage(browser, 'Ева')
  await eve.goto('/')
  await eve.getByLabel('Файл draw.io').setInputFiles({ name: 'Свойства.drawio', mimeType: 'application/vnd.jgraph.mxfile', buffer: Buffer.from(xml) })
  await expect(eve.getByRole('status')).toHaveText('Синхронизировано')
  await expect.poll(() => label(eve, api)).toBe('Контейнер\n[Container: Spring Boot]')
  await select(eve, api)
  await eve.getByRole('button', { name: 'Свойства', exact: true }).click()
  await expect(panel(eve).getByLabel('Технология')).toHaveValue('Spring Boot')
  await expect(panel(eve).getByLabel('Теги')).toHaveValue('core pci')

  await Promise.all([alice.context().close(), eve.context().close()])
})
