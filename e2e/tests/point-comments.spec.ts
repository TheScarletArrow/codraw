import { expect, test, type Page } from '@playwright/test'
import { createBoard, csrfHeaders, openBoard, twoParticipants, userPage, view } from './helpers.ts'

const panel = (page: Page) => page.getByRole('complementary', { name: 'Комментарии' })
const thread = (page: Page) => panel(page).getByRole('article', { name: 'Ветка: Место на холсте' })
const mark = (page: Page, comments: number) => page.getByRole('button', { name: `Комментарии в точке: ${comments}` })

interface Point {
  x: number
  y: number
}

/** The point of the diagram under a point of the window, as the canvas of the participant has it. */
function diagramPoint(page: Page, { x, y }: Point): Promise<Point> {
  return page.evaluate(({ x, y }) => {
    // Mirrors EDITOR_PROPERTY in frontend/src/diagram/editor.ts.
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    return container.__codrawEditor.toDiagramPoint(x, y) as Point
  }, { x, y })
}

/** The point of the diagram that the pointed bottom-left corner of the only mark of the participant stands at. */
async function markPoint(page: Page): Promise<Point> {
  const box = (await page.getByTestId('comment-pin').boundingBox())!
  return diagramPoint(page, { x: box.x, y: box.y + box.height })
}

const near = (a: Point, b: Point) => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1

test('a comment on an empty spot reaches the other participant at the same point, who answers, and the thread brings the canvas to it', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)

  // Alice turns the comment tool on and clicks an empty spot: the field of the new thread takes the keyboard.
  const tool = alice.getByRole('button', { name: 'Комментарий', exact: true })
  await tool.click()
  await expect(tool).toHaveAttribute('aria-pressed', 'true')
  // Near the top-left corner, far from the middle of the view.
  const canvas = (await alice.getByTestId('diagram-canvas').boundingBox())!
  const spot = { x: canvas.x + 60, y: canvas.y + 50 }
  await alice.mouse.click(spot.x, spot.y)
  await expect(panel(alice).getByRole('group', { name: 'Новая ветка' })).toContainText('Место на холсте')
  await expect(alice.getByTestId('comment-draft-pin')).toBeVisible()
  const field = panel(alice).getByRole('combobox', { name: 'Новый комментарий' })
  await expect(field).toBeFocused()
  await field.pressSequentially('Сюда нужен кэш')
  await field.press('Enter')
  await expect(mark(alice, 1)).toBeVisible()
  const placed = await diagramPoint(alice, spot)
  expect(near(await markPoint(alice), placed)).toBe(true)

  // Боб sees the mark at the same point of the diagram, opens its thread and answers.
  await expect(mark(bob, 1)).toBeVisible()
  expect(near(await markPoint(bob), placed)).toBe(true)
  await mark(bob, 1).click()
  await expect(thread(bob)).toHaveAttribute('aria-current', 'true')
  await expect(thread(bob)).toContainText('Сюда нужен кэш')
  const answer = thread(bob).getByRole('combobox', { name: 'Ответ' })
  await answer.pressSequentially('Согласен, Redis')
  await answer.press('Enter')

  await expect(mark(alice, 2)).toBeVisible()
  await expect(thread(alice).getByRole('listitem')).toHaveCount(2)

  // Escape leaves the tool; Alice drags the mark of her thread, and Боб sees it at its new point.
  await alice.keyboard.press('Escape')
  await expect(tool).toHaveAttribute('aria-pressed', 'false')
  const from = (await mark(alice, 2).boundingBox())!
  await alice.mouse.move(from.x + 8, from.y + 8)
  await alice.mouse.down()
  await alice.mouse.move(from.x + 68, from.y + 38, { steps: 5 })
  await alice.mouse.move(from.x + 128, from.y + 68, { steps: 5 })
  await alice.mouse.up()
  const moved = { x: placed.x + 120, y: placed.y + 60 }
  await expect.poll(async () => near(await markPoint(alice), moved)).toBe(true)
  await expect.poll(async () => near(await markPoint(bob), moved)).toBe(true)

  // A click on the thread in the panel brings its point to the middle of the canvas, also from another page.
  const firstPage = (await view(alice)).page
  const centred = async () => {
    const middle = await view(alice)
    return middle.page === firstPage && Math.abs(middle.x - moved.x) <= 2 && Math.abs(middle.y - moved.y) <= 2
  }
  expect(await centred()).toBe(false)
  await thread(alice).getByRole('button', { name: 'Место на холсте' }).click()
  await expect.poll(centred).toBe(true)
  await expect(mark(alice, 2)).toBeInViewport()

  await alice.getByRole('button', { name: 'Добавить страницу' }).click()
  await expect(alice.getByRole('tab', { name: 'Страница 2' })).toHaveAttribute('aria-selected', 'true')
  await expect(mark(alice, 2)).toBeHidden()
  await thread(alice).getByRole('button', { name: 'Место на холсте' }).click()
  await expect(alice.getByRole('tab', { name: 'Страница 1' })).toHaveAttribute('aria-selected', 'true')
  await expect.poll(centred).toBe(true)

  await close()
})

test('a participant who may only view comments on a point of the empty canvas from its menu', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await createBoard(alice)
  const boardId = new URL(url).pathname.split('/').pop()!
  const response = await alice.request.patch(`/api/boards/${boardId}`, {
    data: { linkAccess: 'view' },
    headers: await csrfHeaders(alice.request),
  })
  expect(response.status()).toBe(200)
  await openBoard(bob, url)
  await expect(bob.getByText('Только просмотр')).toBeVisible()

  const canvas = (await bob.getByTestId('diagram-canvas').boundingBox())!
  const spot = { x: canvas.x + 200, y: canvas.y + 160 }
  await bob.mouse.click(spot.x, spot.y, { button: 'right' })
  const menu = bob.getByRole('menu', { name: 'Действия' })
  // «Выделить всё» shows its shortcut too.
  await expect(menu.getByRole('menuitem')).toHaveText([/^Выделить всё/, 'Комментировать здесь'])
  await menu.getByRole('menuitem', { name: 'Комментировать здесь' }).click()
  const field = panel(bob).getByRole('combobox', { name: 'Новый комментарий' })
  await expect(field).toBeFocused()
  await field.pressSequentially('Здесь не хватает очереди')
  await field.press('Enter')

  await expect(mark(alice, 1)).toBeVisible()
  expect(near(await markPoint(alice), await diagramPoint(bob, spot))).toBe(true)
  await mark(alice, 1).click()
  await expect(thread(alice)).toContainText('Здесь не хватает очереди')
  await expect(thread(alice)).toContainText('Боб')

  await Promise.all([alice.context().close(), bob.context().close()])
})
