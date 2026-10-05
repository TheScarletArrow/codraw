import { expect, test, type Page } from '@playwright/test'
import { addShape, twoParticipants } from './helpers.ts'

/** The page, the middle of the view and the scale of the canvas of a participant. */
function view(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const editor = container.__codrawEditor
    const center = editor.viewportCenter()
    return { page: editor.pageId as string, x: Math.round(center.x), y: Math.round(center.y), scale: editor.graph.getView().scale as number }
  })
}

test('a participant follows another: their page, scroll and zoom, until they move the canvas on their own', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  // Bob works on a page of his own, zoomed in and scrolled.
  await bob.getByRole('button', { name: 'Добавить страницу' }).click()
  await expect(bob.getByRole('tab', { name: 'Страница 2' })).toHaveAttribute('aria-selected', 'true')
  await addShape(bob, 'Прямоугольник')
  await bob.getByRole('button', { name: 'Увеличить', exact: true }).click()
  await bob.getByRole('button', { name: 'Увеличить', exact: true }).click()

  await alice.getByRole('list', { name: 'Участники' }).getByRole('button', { name: /Боб/ }).click()

  await expect(alice.getByRole('region', { name: 'Следование' })).toContainText('Вы следуете за Боб')
  await expect(alice.getByRole('tab', { name: 'Страница 2' })).toHaveAttribute('aria-selected', 'true')
  await expect.poll(async () => (await view(alice)).scale).toBe((await view(bob)).scale)

  // Bob scrolls: Alice's view follows.
  const canvas = bob.getByTestId('diagram-canvas')
  const box = (await canvas.boundingBox())!
  await bob.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await bob.mouse.wheel(0, 300)
  await expect
    .poll(async () => {
      const [a, b] = [await view(alice), await view(bob)]
      return Math.abs(a.x - b.x) <= 2 && Math.abs(a.y - b.y) <= 2 && a.page === b.page
    })
    .toBe(true)

  // Alice scrolls on her own: she follows no more.
  const aliceCanvas = (await alice.getByTestId('diagram-canvas').boundingBox())!
  await alice.mouse.move(aliceCanvas.x + aliceCanvas.width / 2, aliceCanvas.y + aliceCanvas.height / 2)
  await alice.mouse.wheel(0, 200)
  await expect(alice.getByRole('region', { name: 'Следование' })).toBeHidden()
  const scale = (await view(alice)).scale
  await bob.getByRole('button', { name: 'Уменьшить', exact: true }).click()
  await bob.getByRole('button', { name: 'Уменьшить', exact: true }).click()
  await bob.waitForTimeout(500)
  expect((await view(alice)).scale).toBe(scale)

  await close()
})
