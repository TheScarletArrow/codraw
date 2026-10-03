import { expect, test } from '@playwright/test'

test('participants of a board see each other and the list updates when one leaves', async ({ browser }) => {
  const alice = await browser.newContext()
  const bob = await browser.newContext()
  const alicePage = await alice.newPage()

  await alicePage.goto('/')
  await alicePage.getByRole('button', { name: 'Создать доску' }).click()
  await expect(alicePage).toHaveURL(/\/boards\/[0-9a-f-]{36}$/)
  await expect(alicePage.getByRole('heading', { name: 'Новая доска' })).toBeVisible()
  await expect(alicePage.getByRole('status')).toHaveText('Синхронизировано')

  const bobPage = await bob.newPage()
  await bobPage.goto(alicePage.url())
  await expect(bobPage.getByRole('status')).toHaveText('Синхронизировано')

  const aliceParticipants = alicePage.getByRole('list', { name: 'Участники' }).getByRole('listitem')
  const bobParticipants = bobPage.getByRole('list', { name: 'Участники' }).getByRole('listitem')
  await expect(aliceParticipants).toHaveCount(2)
  await expect(bobParticipants).toHaveCount(2)
  await expect(aliceParticipants.first()).toHaveText(/^Гость \d+ \(вы\)$/)
  await expect(aliceParticipants.nth(1)).toHaveText(/^Гость \d+$/)

  await bob.close()
  await expect(aliceParticipants).toHaveCount(1, { timeout: 30_000 })

  await alice.close()
})

test('the created board appears in the list on the home page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Создать доску' }).click()
  await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/)
  const boardUrl = new URL(page.url()).pathname

  await page.getByRole('link', { name: 'CoDraw' }).click()

  await expect(page.locator(`a[href="${boardUrl}"]`)).toHaveText('Новая доска')
})

test('shows "Доска не найдена" for an unknown board', async ({ page }) => {
  await page.goto('/boards/0199a000-0000-7000-8000-000000000099')

  await expect(page.getByRole('alert')).toHaveText('Доска не найдена')
})
