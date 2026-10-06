import { expect, test, type Page, type Response } from '@playwright/test'
import { addShape, createBoard, openBoard, storedVertexCount, userPage } from './helpers.ts'

const history = (page: Page) => page.getByRole('complementary', { name: 'История версий' })
const banner = (page: Page) => page.getByRole('region', { name: 'С прошлого визита' })
const changes = (page: Page) => page.getByRole('region', { name: 'Изменения с прошлого визита' })
const mark = (page: Page, cell: string) => page.locator(`[data-testid=change-mark][data-cell="${cell}"]`)

/** Whether the address is the one of the visit of a board. */
const isVisit = (url: string) => new URL(url).pathname.endsWith('/visit')

/** Whether the response answers a report of the visit with this method. */
const visitReport = (method: string) => (response: Response) =>
  response.request().method() === method && isVisit(response.url())

/** Ids of the cells selected on the canvas. */
function selectedIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    return container.__codrawEditor.graph.getSelectionCells().map((cell: { getId(): string }) => cell.getId())
  })
}

test('back on the board, the owner learns who changed it since the last visit and sees the changes', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await createBoard(alice)
  const boardId = new URL(url).pathname.split('/').at(-1)!
  await addShape(alice, 'Прямоугольник')
  await expect.poll(() => storedVertexCount(boardId), { timeout: 15_000 }).toBe(1)

  // The owner keeps the board as it is and goes to the list of boards; the backend hears that she left.
  await alice.getByRole('button', { name: 'Меню доски «Новая доска»' }).click()
  await alice.getByRole('menuitem', { name: 'История версий' }).click()
  await history(alice).getByRole('button', { name: 'Сохранить версию' }).click()
  await expect(history(alice).getByRole('button', { name: /Вручную/ })).toHaveCount(1)
  const left = alice.waitForResponse(visitReport('DELETE'))
  await alice.getByRole('link', { name: 'CoDraw' }).click()
  expect((await left).status()).toBe(204)

  // A participant who edits through the link adds a shape meanwhile; his own first visit tells him nothing.
  const bobStarted = bob.waitForResponse(visitReport('POST'))
  await openBoard(bob, url)
  await bobStarted
  const added = await addShape(bob, 'Эллипс')
  await expect.poll(() => storedVertexCount(boardId), { timeout: 15_000 }).toBe(2)
  await expect(banner(bob)).toBeHidden()

  // The owner comes back.
  const returned = alice.waitForResponse(visitReport('POST'))
  await openBoard(alice, url)
  const { since: lastVisitEnd } = (await (await returned).json()) as { since: string }
  await expect(banner(alice)).toContainText(
    /С вашего прошлого визита \((сегодня|вчера) в \d{1,2}:\d{2}\) доску изменил\(а\) Боб/,
  )
  await banner(alice).getByRole('button', { name: 'Показать изменения' }).click()

  const list = changes(alice).getByRole('complementary', { name: 'Изменения' })
  await expect(list.getByText('Добавлено 1 · Изменено 0 · Удалено 0')).toBeVisible()
  await expect(mark(alice, added)).toHaveAttribute('data-change', 'added')
  await expect(alice.locator('[data-testid=change-mark]')).toHaveCount(1)
  await list.getByRole('button', { name: /Добавлено: Эллипс/ }).click()
  await expect.poll(() => selectedIds(alice)).toEqual([added])

  await changes(alice).getByRole('button', { name: 'Закрыть' }).click()
  await expect(changes(alice)).toBeHidden()
  await expect(alice.getByRole('complementary', { name: 'Фигуры' })).toBeVisible()
  await banner(alice).getByRole('button', { name: 'Скрыть' }).click()
  await expect(banner(alice)).toBeHidden()

  // A reload ends the visit while the page closes, and the next one begins after it: nobody changed the board since.
  // The closing page tells that it left with a keepalive request from `pagehide`, which Playwright does not always see
  // and which gets no answer the test could see, so the test checks what the backend made of it: the new visit begins
  // where the reload ended the one before, after the end of the visit before that. Had the closing page reported its
  // presence after leaving, or not left at all, the new page would go on with the old visit, which began at that end
  // and names Боб. The new page reports nothing before its visit begins.
  const reports: string[] = []
  alice.on('request', (request) => {
    if (isVisit(request.url())) reports.push(request.method())
  })
  const restarted = alice.waitForResponse(visitReport('POST'))
  await alice.reload()
  const visit = (await (await restarted).json()) as { since: string }
  expect(visit).toMatchObject({ authors: [], baseline: null })
  expect(Date.parse(visit.since)).toBeGreaterThan(Date.parse(lastVisitEnd))
  expect(reports.filter((method) => method !== 'DELETE')).toEqual(['POST'])
  await expect(alice.getByRole('status')).toHaveText('Синхронизировано')
  await expect(banner(alice)).toBeHidden()

  await Promise.all([alice.context().close(), bob.context().close()])
})
