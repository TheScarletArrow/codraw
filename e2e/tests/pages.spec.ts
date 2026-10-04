import { expect, test, type Page } from '@playwright/test'
import { addShape, createBoard, twoParticipants, userPage, vertices } from './helpers.ts'

const tabs = (page: Page) => page.getByRole('tablist', { name: 'Страницы' }).getByRole('tab')
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })

/** Names of the page tabs in their order. */
const tabNames = (page: Page) => tabs(page).evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')))

async function menuItem(page: Page, pageName: string, item: string) {
  await page.getByRole('button', { name: `Меню страницы «${pageName}»` }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

test('pages added, renamed, duplicated, moved and deleted by one participant change for the other', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)

  await alice.getByRole('button', { name: 'Добавить страницу' }).click()
  await expect(tab(alice, 'Страница 2')).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => tabNames(bob)).toEqual(['Страница 1', 'Страница 2'])
  await expect(tab(bob, 'Страница 1')).toHaveAttribute('aria-selected', 'true')

  await tab(alice, 'Страница 2').dblclick()
  await alice.getByRole('textbox', { name: 'Имя страницы' }).fill('Контейнеры')
  await alice.keyboard.press('Enter')
  await expect.poll(() => tabNames(bob)).toEqual(['Страница 1', 'Контейнеры'])

  // Shapes belong to their page.
  const shape = await addShape(alice, 'Прямоугольник')
  await bob.waitForTimeout(300)
  expect(await vertices(bob)).toEqual([])
  await tab(bob, 'Контейнеры').click()
  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.id)).toEqual([shape])

  await menuItem(alice, 'Контейнеры', 'Дублировать')
  await expect(tab(alice, 'Контейнеры (копия)')).toHaveAttribute('aria-selected', 'true')
  await expect.poll(async () => (await vertices(alice)).length).toBe(1)
  expect((await vertices(alice))[0]!.id).not.toBe(shape)
  await expect.poll(() => tabNames(bob)).toEqual(['Страница 1', 'Контейнеры', 'Контейнеры (копия)'])

  await menuItem(alice, 'Контейнеры (копия)', 'Переместить влево')
  await expect.poll(() => tabNames(bob)).toEqual(['Страница 1', 'Контейнеры (копия)', 'Контейнеры'])

  // Bob works on the copy when Alice deletes it.
  await tab(bob, 'Контейнеры (копия)').click()
  await menuItem(alice, 'Контейнеры (копия)', 'Удалить')
  await alice.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click()
  await expect.poll(() => tabNames(bob)).toEqual(['Страница 1', 'Контейнеры'])
  await expect(tab(bob, 'Страница 1')).toHaveAttribute('aria-selected', 'true')
  expect(await vertices(bob)).toEqual([])

  await close()
})

test('the address keeps the page, and undo works within a page across switching', async ({ browser }) => {
  const page = await userPage(browser, 'Алиса')
  await createBoard(page)
  await page.getByRole('button', { name: 'Добавить страницу' }).click()
  const second = await addShape(page, 'Эллипс')

  await page.reload()
  await expect(page.getByRole('status')).toHaveText('Синхронизировано')
  await expect(tab(page, 'Страница 2')).toHaveAttribute('aria-selected', 'true')
  await expect.poll(async () => (await vertices(page)).map((cell) => cell.id)).toEqual([second])

  await tab(page, 'Страница 1').click()
  await addShape(page, 'Прямоугольник')
  await tab(page, 'Страница 2').click()
  await expect.poll(async () => (await vertices(page)).length).toBe(1)
  await tab(page, 'Страница 1').click()
  await expect.poll(async () => (await vertices(page)).length).toBe(1)
  await page.getByRole('button', { name: 'Отменить' }).click()
  await expect.poll(async () => (await vertices(page)).length).toBe(0)

  await tab(page, 'Страница 2').click()
  await expect.poll(async () => (await vertices(page)).map((cell) => cell.id)).toEqual([second])

  await page.context().close()
})
