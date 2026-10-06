import { expect, test, type Page } from '@playwright/test'
import { addShape, createBoard, openBoard, storedVertexCount, userPage, vertices } from './helpers.ts'

const history = (page: Page) => page.getByRole('complementary', { name: 'История версий' })
const preview = (page: Page) => page.getByRole('region', { name: /^Версия от / })
const tabNames = (page: Page) => page.getByRole('tablist', { name: 'Страницы' }).getByRole('tab')

test('the owner restores a version after a participant wiped the board, and the participant sees it at once', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await createBoard(alice)
  await addShape(alice, 'Прямоугольник')
  await addShape(alice, 'Эллипс')
  await alice.getByRole('button', { name: 'Добавить страницу' }).click()
  await expect(tabNames(alice)).toHaveText(['Страница 1', 'Страница 2'])
  await alice.getByRole('tab', { name: 'Страница 1' }).click()

  // The owner keeps the board as it is.
  await alice.getByRole('button', { name: 'Меню доски «Новая доска»' }).click()
  await alice.getByRole('menuitem', { name: 'История версий' }).click()
  await history(alice).getByRole('button', { name: 'Сохранить версию' }).click()
  await expect(history(alice).getByRole('button', { name: /Вручную/ })).toHaveCount(1)

  // A participant through the link deletes the shapes and the second page.
  await openBoard(bob, url)
  await expect.poll(async () => (await vertices(bob)).length).toBe(2)
  await bob.getByTestId('diagram-canvas').click({ position: { x: 5, y: 5 } })
  await bob.keyboard.press('Control+A')
  await bob.keyboard.press('Delete')
  await bob.getByRole('button', { name: 'Меню страницы «Страница 2»' }).click()
  await bob.getByRole('menuitem', { name: 'Удалить' }).click()
  await bob.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click()
  await expect.poll(async () => (await vertices(alice)).length).toBe(0)
  await expect(tabNames(alice)).toHaveText(['Страница 1'])

  // The owner looks at the version and restores it.
  await history(alice).getByRole('button', { name: /Вручную/ }).click()
  await expect(preview(alice).getByRole('tab')).toHaveText(['Страница 1', 'Страница 2'])
  await expect.poll(async () => (await vertices(alice)).length).toBe(2)
  await preview(alice).getByRole('button', { name: 'Восстановить эту версию' }).click()
  await alice.getByRole('alertdialog', { name: 'Восстановление версии' }).getByRole('button', { name: 'Восстановить' }).click()

  await expect(preview(alice)).toBeHidden()
  await expect(tabNames(alice)).toHaveText(['Страница 1', 'Страница 2'])
  await expect.poll(async () => (await vertices(alice)).length).toBe(2)
  // The participant gets it without reloading.
  await expect(tabNames(bob)).toHaveText(['Страница 1', 'Страница 2'])
  await expect.poll(async () => (await vertices(bob)).length).toBe(2)
  // The wiped board stays in the history.
  await expect(history(alice).getByRole('button').filter({ hasText: /Перед восстановлением/ })).toHaveCount(1)

  await Promise.all([alice.context().close(), bob.context().close()])
})

test('a version names who changed the board since the version before, and whoever edits the board names it', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await createBoard(alice)
  const boardId = new URL(url).pathname.split('/').at(-1)!
  await openBoard(bob, url)

  // Both change the board: the owner and a participant who edits through the link.
  await addShape(alice, 'Прямоугольник')
  await addShape(bob, 'Эллипс')
  // collab stores the changes a moment after them, and with them who made them.
  await expect.poll(() => storedVertexCount(boardId), { timeout: 15_000 }).toBe(2)

  await alice.getByRole('button', { name: 'Меню доски «Новая доска»' }).click()
  await alice.getByRole('menuitem', { name: 'История версий' }).click()
  await history(alice).getByRole('textbox', { name: 'Название версии' }).fill('Схема v1')
  await history(alice).getByRole('button', { name: 'Сохранить версию' }).click()

  const saved = history(alice).getByRole('listitem').filter({ hasText: 'Схема v1' })
  await expect(saved.getByRole('button', { name: /Изменили: Алиса, Боб/ })).toBeVisible()
  await expect(saved.getByText('Алиса, Боб', { exact: true })).toBeVisible()
  await expect(history(alice).getByRole('textbox', { name: 'Название версии' })).toHaveValue('')

  await saved.getByRole('button', { name: 'Переименовать' }).click()
  const name = history(alice).getByRole('textbox', { name: 'Новое название версии' })
  await name.fill('Схема v2')
  await name.press('Enter')
  await expect(history(alice).getByRole('listitem').filter({ hasText: 'Схема v2' })).toHaveCount(1)

  // A participant who edits through the link sees the versions with their names and authors and renames them too.
  await bob.getByRole('button', { name: 'Меню доски «Новая доска»' }).click()
  await bob.getByRole('menuitem', { name: 'История версий' }).click()
  const named = history(bob).getByRole('listitem').filter({ hasText: 'Схема v2' })
  await expect(named.getByRole('button', { name: /Изменили: Алиса, Боб/ })).toBeVisible()
  await named.getByRole('button', { name: 'Переименовать' }).click()
  const bobName = history(bob).getByRole('textbox', { name: 'Новое название версии' })
  await bobName.fill('Схема v3')
  await bobName.press('Enter')
  await expect(history(bob).getByRole('listitem').filter({ hasText: 'Схема v3' })).toHaveCount(1)

  // The name is kept.
  await alice.reload()
  await expect(alice.getByRole('status')).toHaveText('Синхронизировано')
  await alice.getByRole('button', { name: 'Меню доски «Новая доска»' }).click()
  await alice.getByRole('menuitem', { name: 'История версий' }).click()
  const renamed = history(alice).getByRole('listitem').filter({ hasText: 'Схема v3' })
  await expect(renamed.getByRole('button', { name: /Изменили: Алиса, Боб/ })).toBeVisible()
  await expect(history(alice).getByRole('listitem').filter({ hasText: /Схема v[12]/ })).toHaveCount(0)

  await Promise.all([alice.context().close(), bob.context().close()])
})
