import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, createBoard, twoParticipants, userPage, vertices } from './helpers.ts'

const menu = (page: Page) => page.getByRole('menu', { name: 'Действия' })
const properties = (page: Page) => page.getByRole('complementary', { name: 'Свойства' })
const elements = (page: Page) => page.getByRole('complementary', { name: 'Элементы доски' })
const canvas = (page: Page) => page.getByTestId('diagram-canvas')
const labels = async (page: Page) => (await vertices(page)).map((cell) => cell.value)

/** Right-clicks the middle of a shape and chooses an item of its menu. */
async function fromMenu(page: Page, id: string, item: string) {
  const at = center(await cellBox(page, id))
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await menu(page).getByRole('menuitem', { name: item, exact: true }).click()
}

/** Right-clicks an empty point near the top left corner of the canvas, away from the minimap, and chooses an item. */
async function fromCanvasMenu(page: Page, item: string) {
  const box = (await canvas(page).boundingBox())!
  await page.mouse.click(box.x + 150, box.y + 100, { button: 'right' })
  await menu(page).getByRole('menuitem', { name: item, exact: true }).click()
}

test('one element on two pages: pasted as the same element, renamed for everybody, used here and there, removed from all pages and back', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const payments = await addShape(alice, 'Container')
  await fromMenu(alice, payments, 'Копировать')

  // Алиса adds a page and pastes the container there as the same element.
  await alice.getByRole('button', { name: 'Добавить страницу' }).click()
  await expect(alice.getByRole('tab', { name: 'Страница 2' })).toHaveAttribute('aria-selected', 'true')
  await fromCanvasMenu(alice, 'Вставить как тот же элемент')
  await expect.poll(() => labels(alice)).toEqual(['Контейнер\n[Container]'])
  const pasted = (await vertices(alice))[0]!.id

  // She renames it on the second page; Боб sees the new name on the first.
  await fromMenu(alice, pasted, 'Свойства…')
  await properties(alice).getByLabel('Имя').fill('Payments')
  await properties(alice).getByLabel('Имя').press('Enter')
  await expect.poll(() => labels(alice)).toEqual(['Payments\n[Container]'])
  await expect.poll(() => labels(bob)).toEqual(['Payments\n[Container]'])

  // The badge tells that the element is on another page too, and «Где используется…» goes there.
  await expect(alice.getByTestId('shared-badge')).toHaveAccessibleName('Есть ещё на 1 странице: Страница 1')
  await fromMenu(alice, pasted, 'Где используется…')
  const payment = elements(alice).getByRole('button', { name: /Payments/ })
  await expect(payment).toHaveAttribute('aria-expanded', 'true')
  await expect(payment).toContainText('2 стр.')
  await elements(alice).getByRole('list', { name: 'Где используется Payments' }).getByRole('button', { name: 'Страница 1' }).click()
  await expect(alice.getByRole('tab', { name: 'Страница 1' })).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => labels(alice)).toEqual(['Payments\n[Container]'])

  // Deleting the cell of one page leaves the element on the other.
  await alice.getByRole('tab', { name: 'Страница 2' }).click()
  await expect.poll(() => labels(alice)).toEqual(['Payments\n[Container]'])
  await fromMenu(alice, pasted, 'Удалить')
  await expect.poll(() => labels(alice)).toEqual([])
  await expect.poll(() => labels(bob)).toEqual(['Payments\n[Container]'])
  await canvas(alice).focus()
  await alice.keyboard.press('Control+z')
  await expect.poll(() => labels(alice)).toEqual(['Payments\n[Container]'])

  // «Удалить со всех страниц…» removes both cells after the confirmation, and one undo brings both back.
  await fromMenu(alice, pasted, 'Удалить со всех страниц…')
  const confirmation = alice.getByRole('alertdialog', { name: 'Удалить со всех страниц' })
  await expect(confirmation.getByRole('list', { name: 'Страницы' })).toContainText('Страница 1 — 1')
  await expect(confirmation.getByRole('list', { name: 'Страницы' })).toContainText('Страница 2 — 1')
  await confirmation.getByRole('button', { name: 'Удалить' }).click()
  await expect.poll(() => labels(alice)).toEqual([])
  await expect.poll(() => labels(bob)).toEqual([])
  await canvas(alice).focus()
  await alice.keyboard.press('Control+z')
  await expect.poll(() => labels(alice)).toEqual(['Payments\n[Container]'])
  await expect.poll(() => labels(bob)).toEqual(['Payments\n[Container]'])

  await close()
})

test('a drag from «Элементы доски» adds another cell of the element on another page', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  const api = await addShape(alice, 'Container')
  await fromMenu(alice, api, 'Свойства…')
  await properties(alice).getByLabel('Технология').fill('Go')
  await properties(alice).getByLabel('Технология').press('Enter')
  await expect.poll(() => labels(alice)).toEqual(['Контейнер\n[Container: Go]'])

  await alice.getByRole('button', { name: 'Добавить страницу' }).click()
  await expect(alice.getByRole('tab', { name: 'Страница 2' })).toHaveAttribute('aria-selected', 'true')
  await alice.getByRole('button', { name: 'Элементы доски', exact: true }).click()
  await elements(alice).getByRole('button', { name: /Контейнер/ }).dragTo(canvas(alice), { targetPosition: { x: 300, y: 200 } })

  await expect.poll(() => labels(alice)).toEqual(['Контейнер\n[Container: Go]'])
  await expect(elements(alice).getByRole('button', { name: /Контейнер/ })).toContainText('2 стр.')

  await alice.context().close()
})
