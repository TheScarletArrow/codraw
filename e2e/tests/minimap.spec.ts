import { expect, test, type Page } from '@playwright/test'
import { createBoard, csrfHeaders, openBoard, twoParticipants, userPage, vertices, view } from './helpers.ts'

const minimap = (page: Page) => page.getByRole('region', { name: 'Мини-карта' })

/** Adds a rectangle with its middle at a point of the page, through the editor the app exposes on the canvas. */
async function addShapeAt(page: Page, x: number, y: number) {
  const count = (await vertices(page)).length
  await page.evaluate(
    ([x, y]) => {
      const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
      container.__codrawEditor.addShape('rectangle', { x, y })
    },
    [x, y] as const,
  )
  await expect.poll(async () => (await vertices(page)).length).toBe(count + 1)
}

/** The scroll of the canvas and the shift of its view: going somewhere changes one of them. */
const scroll = (page: Page) =>
  page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as HTMLElement & Record<string, any>
    const { translate } = container.__codrawEditor.graph.getView()
    return { left: container.scrollLeft, top: container.scrollTop, x: translate.x as number, y: translate.y as number }
  })

/** A shape in the top left corner of the page and one far to the bottom right of it. */
async function fillPage(page: Page) {
  await addShapeAt(page, 200, 150)
  await addShapeAt(page, 3000, 2000)
}

test('the minimap shows the page with the view and the other participant, and goes where it is clicked or dragged', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  // An empty page has no minimap.
  await expect(alice.getByTestId('diagram-canvas')).toBeVisible()
  await expect(alice.getByRole('button', { name: 'Свернуть мини-карту' })).toBeHidden()

  await fillPage(alice)
  await expect(minimap(alice)).toBeVisible()
  await expect(minimap(bob)).toBeVisible()
  // Bob looks at the same page: he is a dot on the minimap of Alice.
  await expect(alice.getByTestId('minimap-participant')).toHaveAttribute('data-participant', 'Боб')

  // Alice follows Bob, then goes to the bottom right corner of the page with the minimap: following ends.
  await alice.getByRole('list', { name: 'Участники' }).getByRole('button', { name: /Боб/ }).click()
  await expect(alice.getByRole('region', { name: 'Следование' })).toContainText('Вы следуете за Боб')
  const before = await view(alice)
  const scrolled = await scroll(alice)
  const box = (await alice.getByTestId('minimap').boundingBox())!
  await alice.mouse.click(box.x + box.width - 12, box.y + box.height - 10)

  await expect(alice.getByRole('region', { name: 'Следование' })).toBeHidden()
  await expect.poll(async () => (await view(alice)).x).toBeGreaterThan(before.x + 1000)
  expect((await view(alice)).y).toBeGreaterThan(before.y + 600)
  expect((await view(alice)).scale).toBe(before.scale)
  expect(await scroll(alice)).not.toEqual(scrolled)

  // Dragging the frame to the left scrolls the canvas to the left.
  const clicked = await view(alice)
  const frame = (await alice.getByTestId('minimap-frame').boundingBox())!
  const from = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }
  const beforeDrag = await scroll(alice)
  await alice.mouse.move(from.x, from.y)
  await alice.mouse.down()
  await alice.mouse.move(from.x - 20, from.y - 10, { steps: 5 })
  await alice.mouse.move(from.x - 40, from.y - 20, { steps: 5 })
  await alice.mouse.up()

  await expect.poll(async () => (await view(alice)).x).toBeLessThan(clicked.x - 300)
  expect((await view(alice)).y).toBeLessThan(clicked.y - 150)
  expect(await scroll(alice)).not.toEqual(beforeDrag)

  // Bob goes to the bottom right corner too: his dot follows his view.
  const dot = alice.getByTestId('minimap-participant')
  const dotBefore = (await dot.boundingBox())!
  const bobsMap = (await bob.getByTestId('minimap').boundingBox())!
  await bob.mouse.click(bobsMap.x + bobsMap.width - 12, bobsMap.y + bobsMap.height - 10)
  await expect.poll(async () => (await dot.boundingBox())!.x).toBeGreaterThan(dotBefore.x + 5)

  // On another page Bob is no dot on the minimap of Alice.
  await bob.getByRole('button', { name: 'Добавить страницу' }).click()
  await expect(bob.getByRole('tab', { name: 'Страница 2' })).toHaveAttribute('aria-selected', 'true')
  await expect(alice.getByTestId('minimap-participant')).toBeHidden()

  await close()
})

test('the minimap stays collapsed after a reload, and M collapses and expands it', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const url = await createBoard(alice)
  await fillPage(alice)
  await expect(minimap(alice)).toBeVisible()

  await alice.getByRole('button', { name: 'Свернуть мини-карту' }).click()
  await expect(minimap(alice)).toBeHidden()

  await openBoard(alice, url)
  await expect(alice.getByRole('button', { name: 'Развернуть мини-карту' })).toBeVisible()
  await expect(minimap(alice)).toBeHidden()

  await alice.keyboard.press('m')
  await expect(minimap(alice)).toBeVisible()

  await openBoard(alice, url)
  await expect(minimap(alice)).toBeVisible()
  await alice.keyboard.press('m')
  await expect(minimap(alice)).toBeHidden()

  await alice.context().close()
})

test('a participant who may only view goes around the page with the minimap, changing nothing', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await createBoard(alice)
  const boardId = new URL(url).pathname.split('/').pop()!
  const response = await alice.request.patch(`/api/boards/${boardId}`, {
    data: { linkAccess: 'view' },
    headers: await csrfHeaders(alice.request),
  })
  expect(response.status()).toBe(200)
  await fillPage(alice)

  await openBoard(bob, url)
  await expect(bob.getByText('Только просмотр')).toBeVisible()
  await expect(minimap(bob)).toBeVisible()
  const before = await view(bob)
  const box = (await bob.getByTestId('minimap').boundingBox())!
  await bob.mouse.click(box.x + box.width - 12, box.y + box.height - 10)

  await expect.poll(async () => (await view(bob)).x).toBeGreaterThan(before.x + 1000)
  expect((await vertices(alice)).length).toBe(2)

  await Promise.all([alice.context().close(), bob.context().close()])
})
