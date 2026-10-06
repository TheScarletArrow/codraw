import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, createBoard, drag, openBoard, userPage, vertices } from './helpers.ts'

const history = (page: Page) => page.getByRole('complementary', { name: 'История версий' })
const preview = (page: Page) => page.getByRole('region', { name: /^Версия от / })
const changes = (page: Page) => page.getByRole('complementary', { name: 'Изменения' })
const mark = (page: Page, cell: string) => page.locator(`[data-testid=change-mark][data-cell="${cell}"]`)

/** Ids of the cells selected on the canvas. */
function selectedIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    return container.__codrawEditor.graph.getSelectionCells().map((cell: { getId(): string }) => cell.getId())
  })
}

/** Adds a rectangle `dx` to the right of the middle of the view, labels it and returns its id. */
async function labelledShape(page: Page, label: string, dx: number): Promise<string> {
  const shape = await addShape(page, 'Прямоугольник')
  const added = center(await cellBox(page, shape))
  await drag(page, added, { x: added.x + dx, y: added.y })
  await rename(page, shape, label)
  return shape
}

async function rename(page: Page, shape: string, label: string) {
  const box = await cellBox(page, shape)
  await page.mouse.dblclick(center(box).x, center(box).y)
  await expect(page.locator('[data-testid=diagram-canvas] [contenteditable="true"]')).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(label)
  await page.mouse.click(5, 400)
}

test('the owner compares a version with the board after a participant changed it, and goes to each change', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await createBoard(alice)
  const api = await labelledShape(alice, 'API', -250)
  const cache = await labelledShape(alice, 'Кэш', 250)
  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.value).sort()).toEqual(['API', 'Кэш'])

  // The owner keeps the board as it is.
  await alice.getByRole('button', { name: 'Меню доски «Новая доска»' }).click()
  await alice.getByRole('menuitem', { name: 'История версий' }).click()
  await history(alice).getByRole('button', { name: 'Сохранить версию' }).click()
  await expect(history(alice).getByRole('button', { name: /Вручную/ })).toHaveCount(1)

  // A participant through the link adds a shape, renames another and deletes the third.
  await openBoard(bob, url)
  await expect.poll(async () => (await vertices(bob)).length).toBe(2)
  const added = await addShape(bob, 'Эллипс')
  await rename(bob, api, 'Шлюз')
  const cacheBox = await cellBox(bob, cache)
  await bob.mouse.click(center(cacheBox).x, center(cacheBox).y)
  await bob.keyboard.press('Delete')
  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.value).sort()).toEqual(['', 'Шлюз'])

  // The owner opens the version and compares it with the board.
  await history(alice).getByRole('button', { name: /Вручную/ }).click()
  await preview(alice).getByRole('button', { name: 'Сравнить с текущей' }).click()
  await expect(preview(alice).getByRole('button', { name: 'Сравнить с текущей' })).toHaveAttribute('aria-pressed', 'true')
  await expect(changes(alice).getByText('Добавлено 1 · Изменено 1 · Удалено 1')).toBeVisible()
  await expect(mark(alice, added)).toHaveAttribute('data-change', 'added')
  await expect(mark(alice, api)).toHaveAttribute('data-change', 'changed')
  await expect(mark(alice, cache)).toHaveAttribute('data-change', 'removed')
  await expect(mark(alice, cache)).toContainText('Кэш')
  // The canvas shows the board now: the removed shape is only a ghost.
  expect((await vertices(alice)).map((cell) => cell.id).sort()).toEqual([added, api].sort())

  // Each item of the list selects its shape and puts it in the middle of the canvas.
  await changes(alice).getByRole('button', { name: /Изменено: Шлюз/ }).click()
  await expect.poll(() => selectedIds(alice)).toEqual([api])
  await changes(alice).getByRole('button', { name: /Добавлено: Эллипс/ }).click()
  await expect.poll(() => selectedIds(alice)).toEqual([added])
  await changes(alice).getByRole('button', { name: /Удалено: Кэш/ }).click()
  await expect.poll(() => selectedIds(alice)).toEqual([])
  await expect(mark(alice, cache)).toHaveAttribute('data-selected', 'true')
  const canvas = (await alice.getByTestId('diagram-canvas').boundingBox())!
  const ghost = (await mark(alice, cache).boundingBox())!
  expect(Math.abs(center(ghost).x - center(canvas).x)).toBeLessThan(5)
  expect(Math.abs(center(ghost).y - center(canvas).y)).toBeLessThan(5)

  // Turned off, the preview shows the version again.
  await preview(alice).getByRole('button', { name: 'Сравнить с текущей' }).click()
  await expect(changes(alice)).toBeHidden()
  await expect(alice.locator('[data-testid=change-mark]')).toHaveCount(0)
  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.value).sort()).toEqual(['API', 'Кэш'])

  await Promise.all([alice.context().close(), bob.context().close()])
})
