import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, createBoard, drag, openBoard, userPage, vertices, type Box } from './helpers.ts'

const history = (page: Page) => page.getByRole('complementary', { name: 'История версий' })
const preview = (page: Page) => page.getByRole('region', { name: /^Версия от / })
const comments = (page: Page) => page.getByRole('complementary', { name: 'Комментарии' })
const changes = (page: Page) => page.getByRole('complementary', { name: 'Изменения' })

/** The header of a table, where a click selects the table rather than a field. */
const headerOf = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + 12 })

/** Ids of the fields of a table on the canvas. */
function fieldIds(page: Page, table: string): Promise<string[]> {
  return page.evaluate((table) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const cell = container.__codrawEditor.graph.getDataModel().getCell(table)
    return cell ? Array.from({ length: cell.getChildCount() }, (_, index) => cell.getChildAt(index).getId()) : []
  }, table)
}

async function rename(page: Page, shape: string, label: string) {
  const box = await cellBox(page, shape)
  await page.mouse.dblclick(center(box).x, center(box).y)
  await expect(page.locator('[data-testid=diagram-canvas] [contenteditable="true"]')).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(label)
  await page.mouse.click(5, 400)
}

const labels = async (page: Page) => (await vertices(page)).map((cell) => cell.value).sort()

test('the owner brings back a table that a participant deleted, keeping his other change, and undoes it', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await createBoard(alice)
  const table = await addShape(alice, 'Таблица')
  const tableBox = await cellBox(alice, table)
  await drag(alice, headerOf(tableBox), { x: headerOf(tableBox).x - 250, y: headerOf(tableBox).y })
  const api = await addShape(alice, 'Прямоугольник')
  await rename(alice, api, 'API')
  const fields = await fieldIds(alice, table)
  expect(fields).toHaveLength(1)

  // A thread about the table, which stays in the comments when the table is gone.
  const header = headerOf(await cellBox(alice, table))
  await alice.mouse.click(header.x, header.y, { button: 'right' })
  await alice.getByRole('menu', { name: 'Действия' }).getByRole('menuitem', { name: 'Комментировать' }).click()
  const field = comments(alice).getByRole('combobox', { name: 'Новый комментарий' })
  await field.fill('Нужен индекс по email')
  await field.press('Enter')
  await expect(alice.getByRole('button', { name: 'Комментарии к элементу: 1' })).toBeVisible()

  // The owner keeps the board as it is.
  await alice.getByRole('button', { name: 'Меню доски «Новая доска»' }).click()
  await alice.getByRole('menuitem', { name: 'История версий' }).click()
  await history(alice).getByRole('button', { name: 'Сохранить версию' }).click()
  await expect(history(alice).getByRole('button', { name: /Вручную/ })).toHaveCount(1)

  // A participant through the link deletes the table and renames the other shape.
  await openBoard(bob, url)
  await expect.poll(() => labels(bob)).toEqual(['API', 'Таблица'])
  const bobHeader = headerOf(await cellBox(bob, table))
  await bob.mouse.click(bobHeader.x, bobHeader.y)
  await bob.keyboard.press('Delete')
  await rename(bob, api, 'Шлюз')
  await expect.poll(() => labels(alice)).toEqual(['Шлюз'])
  await expect(alice.getByRole('button', { name: 'Комментарии к элементу: 1' })).toBeHidden()

  // The owner selects the table on the canvas of the version and brings it back alone.
  await history(alice).getByRole('button', { name: /Вручную/ }).click()
  await expect.poll(() => labels(alice)).toEqual(['API', 'Таблица'])
  await expect(preview(alice).getByRole('button', { name: 'Восстановить выделенное' })).toBeHidden()
  const versionHeader = headerOf(await cellBox(alice, table))
  await alice.mouse.click(versionHeader.x, versionHeader.y)
  await preview(alice).getByRole('button', { name: 'Восстановить выделенное' }).click()

  await expect(preview(alice)).toBeHidden()
  for (const page of [alice, bob]) {
    await expect.poll(() => labels(page)).toEqual(['Таблица', 'Шлюз'])
    expect((await vertices(page)).find((cell) => cell.value === 'Таблица')?.id).toBe(table)
    expect(await fieldIds(page, table)).toEqual(fields)
  }
  // The thread is about the table again, and no version was saved for it.
  await expect(alice.getByRole('button', { name: 'Комментарии к элементу: 1' })).toBeVisible()
  await expect(bob.getByRole('button', { name: 'Комментарии к элементу: 1' })).toBeVisible()
  await expect(history(alice).getByRole('button').filter({ hasText: /Перед восстановлением/ })).toHaveCount(0)

  // The restore is one change of the owner.
  await alice.keyboard.press('ControlOrMeta+z')
  for (const page of [alice, bob]) await expect.poll(() => labels(page)).toEqual(['Шлюз'])

  // Comparing the version with the board, the removed table comes back from the list of changes.
  await history(alice).getByRole('button', { name: /Вручную/ }).click()
  await preview(alice).getByRole('button', { name: 'Сравнить с текущей' }).click()
  await expect(changes(alice).getByRole('button', { name: /^Вернуть/ })).toHaveCount(2)
  await changes(alice).getByRole('button', { name: 'Вернуть «Таблица»' }).click()
  await expect(preview(alice)).toBeHidden()
  for (const page of [alice, bob]) await expect.poll(() => labels(page)).toEqual(['Таблица', 'Шлюз'])

  await Promise.all([alice.context().close(), bob.context().close()])
})
