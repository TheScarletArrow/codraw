import { expect, test, type Page } from '@playwright/test'
import { twoParticipants, vertices } from './helpers.ts'

/**
 * Adds a shape with a style value of [size] characters, which takes room in the document without being drawn, as one
 * change.
 */
async function addLargeShape(page: Page, size: number) {
  await page.evaluate((size) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const editor = container.__codrawEditor
    const model = editor.graph.getDataModel()
    model.beginUpdate()
    try {
      const x = 100 + editor.graph.getDefaultParent().getChildCount() * 150
      const cell = editor.addShape('rectangle', { x, y: 100 })
      model.setStyle(cell, { ...cell.getStyle(), note: 'x'.repeat(size) })
    } finally {
      model.endUpdate()
    }
  }, size)
}

// collab of the e2e stack takes boards of up to 256 KiB.
test('a change that would make the board larger than its limit reaches nobody, and its author is told so', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  await addLargeShape(alice, 150_000)
  await expect.poll(async () => (await vertices(bob)).length).toBe(1)

  await addLargeShape(alice, 150_000)

  await expect(alice.getByRole('alert')).toContainText('Доска достигла предельного размера')
  await expect(alice.getByRole('status')).toHaveText('Синхронизировано')
  await expect.poll(async () => (await vertices(alice)).length).toBe(1)
  expect(await vertices(bob)).toHaveLength(1)

  // Deleting is how the board gets room again: it passes at the limit.
  await alice.getByRole('button', { name: 'Понятно' }).click()
  await expect(alice.getByRole('alert')).toBeHidden()
  await alice.locator('[data-testid=diagram-canvas]').click({ position: { x: 5, y: 5 } })
  await alice.keyboard.press('ControlOrMeta+a')
  await alice.keyboard.press('Delete')
  await expect.poll(async () => (await vertices(bob)).length).toBe(0)

  await close()
})
