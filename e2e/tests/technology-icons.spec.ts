import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, createBoard, twoParticipants, userPage, vertices } from './helpers.ts'

const panel = (page: Page) => page.getByRole('complementary', { name: 'Свойства' })

/** Selects a shape with a click in its middle. */
async function select(page: Page, id: string) {
  const at = center(await cellBox(page, id))
  await page.mouse.click(at.x, at.y)
}

/** The logos that the badges of a shape show on the canvas of a participant, by their titles. */
function badges(page: Page, id: string): Promise<string[]> {
  return page.evaluate((cellId) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const graph = container.__codrawEditor.graph
    const cell = graph.getDataModel().getCell(cellId)
    return cell ? graph.getCellOverlays(cell).map((overlay: { tooltip: string }) => overlay.tooltip) : []
  }, id)
}

test('the logo of the technology of a container shows on it for everybody, and so does a logo chosen for it', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const api = await addShape(alice, 'Container')
  await select(alice, api)
  await alice.getByRole('button', { name: 'Свойства', exact: true }).click()

  await panel(alice).getByLabel('Технология', { exact: true }).fill('Spring Boot 3')
  await panel(alice).getByLabel('Технология', { exact: true }).press('Enter')

  await expect(panel(alice)).toContainText('Spring Boot — по технологии')
  await expect.poll(() => badges(alice, api)).toEqual(['Spring Boot'])
  await expect.poll(() => badges(bob, api)).toEqual(['Spring Boot'])

  // A logo of its own, and none.
  await panel(alice).getByLabel('Значок', { exact: true }).fill('kotlin')
  await panel(alice).getByRole('button', { name: 'Значок «Kotlin»' }).click()
  await expect.poll(() => badges(bob, api)).toEqual(['Kotlin'])
  await panel(alice).getByRole('button', { name: 'Без значка' }).click()
  await expect.poll(() => badges(bob, api)).toEqual([])
  await panel(alice).getByRole('button', { name: 'По технологии' }).click()
  await expect.poll(() => badges(bob, api)).toEqual(['Spring Boot'])

  await close()
})

test('a logo found by the search of shapes goes onto the canvas as a picture named by it', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)

  await alice.getByRole('searchbox', { name: 'Поиск фигур' }).fill('kotlin')
  await alice.getByRole('region', { name: 'Логотипы' }).getByRole('button', { name: 'Kotlin' }).click()

  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.value)).toContain('Kotlin')

  await alice.context().close()
})
