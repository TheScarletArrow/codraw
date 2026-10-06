import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  addShape,
  createBoard,
  hasStoredDocument,
  openBoard,
  openBoardList,
  twoParticipants,
  userPage,
} from './helpers.ts'

/** The row of a board in the list of own boards; test users keep boards of earlier tests with the same titles. */
const boardRow = (page: Page, boardPath: string) =>
  page.getByRole('listitem').filter({ has: page.locator(`a[href="${boardPath}"]`) })

/**
 * Deletes the board through its menu, confirming the deletion: `scope` is the page of the board or the row of the
 * board in the list of boards. The menu and the confirmation open outside the row.
 */
async function deleteThroughMenu(page: Page, scope: Locator | Page, title: string, item: 'Удалить доску' | 'Удалить') {
  await scope.getByRole('button', { name: `Меню доски «${title}»` }).click()
  await page.getByRole('menuitem', { name: item }).click()
  await page.getByRole('alertdialog', { name: 'Удаление доски' }).getByRole('button', { name: 'Удалить' }).click()
}

test('the owner renames a board on its page, and a participant sees the new title and the board among those opened through links', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const boardPath = new URL(bob.url()).pathname

  await alice.getByRole('button', { name: 'Новая доска', exact: true }).click()
  await alice.getByRole('textbox', { name: 'Название доски' }).fill('Платежи')
  await alice.keyboard.press('Enter')

  await expect(alice.getByRole('heading', { name: 'Платежи', level: 2 })).toBeVisible()
  await expect(bob.getByRole('heading', { name: 'Платежи', level: 2 })).toBeVisible()
  // Only the owner renames the board.
  await expect(bob.getByRole('button', { name: 'Платежи', exact: true })).toHaveCount(0)

  await bob.goto('/')
  const shared = bob.getByRole('region', { name: 'Общие со мной' })
  await expect(shared.locator(`a[href="${boardPath}"]`)).toHaveText('Платежи')
  await expect(shared).toContainText('Алиса')
  await alice.goto('/')
  await expect(alice.locator(`a[href="${boardPath}"]`)).toHaveText('Платежи')

  await close()
})

test('the owner renames a board in the list of boards', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const boardPath = new URL(await createBoard(alice)).pathname
  await alice.goto('/')

  await boardRow(alice, boardPath).getByRole('button', { name: 'Меню доски «Новая доска»' }).click()
  await alice.getByRole('menuitem', { name: 'Переименовать' }).click()
  await alice.getByRole('textbox', { name: 'Название доски' }).fill('Склад')
  await alice.keyboard.press('Enter')

  await expect(alice.locator(`a[href="${boardPath}"]`)).toHaveText('Склад')
  await alice.reload()
  await expect(alice.locator(`a[href="${boardPath}"]`)).toHaveText('Склад')

  await alice.context().close()
})

test('the owner deletes a board on its page, and a participant on the board sees «Доска не найдена»', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const boardPath = new URL(bob.url()).pathname

  await deleteThroughMenu(alice, alice, 'Новая доска', 'Удалить доску')

  await expect(alice).toHaveURL(/\/$/)
  await expect(alice.locator(`a[href="${boardPath}"]`)).toHaveCount(0)
  await expect(bob.getByRole('alert')).toHaveText('Доска не найдена')
  expect(await openBoardList(bob)).not.toContain(boardPath.split('/').pop())
  await expect(bob.locator(`a[href="${boardPath}"]`)).toHaveCount(0)
  await bob.goto(boardPath)
  await expect(bob.getByRole('alert')).toHaveText('Доска не найдена')

  await close()
})

test('a board deleted in the list of boards closes for a participant with their next change, which is not stored', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await createBoard(alice)
  await openBoard(bob, url)
  const boardPath = new URL(url).pathname
  // A store of the board that Alice's page set up, coming after the deletion, would close it for Bob before his change.
  await expect.poll(() => hasStoredDocument(boardPath.split('/').pop()!), { timeout: 10_000 }).toBe(true)
  await alice.goto('/')

  await deleteThroughMenu(alice, boardRow(alice, boardPath), 'Новая доска', 'Удалить')
  await expect(alice.locator(`a[href="${boardPath}"]`)).toHaveCount(0)
  await addShape(bob, 'Прямоугольник')

  await expect(bob.getByRole('alert')).toHaveText('Доска не найдена', { timeout: 10_000 })
  await alice.goto(boardPath)
  await expect(alice.getByRole('alert')).toHaveText('Доска не найдена')

  await Promise.all([alice.context().close(), bob.context().close()])
})
