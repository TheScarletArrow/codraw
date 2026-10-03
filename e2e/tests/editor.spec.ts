import { expect, test } from '@playwright/test'
import { createBoard } from './helpers.ts'

test('a board shows the diagram canvas', async ({ page }) => {
  await createBoard(page)

  const canvas = page.getByTestId('diagram-canvas')
  await expect(canvas).toBeVisible()
  await expect(canvas.locator('svg').first()).toBeAttached()
})
