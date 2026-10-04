import { expect, test } from '@playwright/test'
import { signIn, userPage } from './helpers.ts'

test('participants of a board see each other and the list updates when one leaves', async ({ browser }) => {
  const alicePage = await userPage(browser, 'Алиса')

  await alicePage.goto('/')
  await alicePage.getByRole('button', { name: 'Создать доску' }).click()
  await expect(alicePage).toHaveURL(/\/boards\/[0-9a-f-]{36}(\?page=[^&]+)?$/)
  await expect(alicePage.getByRole('heading', { name: 'Новая доска' })).toBeVisible()
  await expect(alicePage.getByRole('status')).toHaveText('Синхронизировано')

  // Bob opens the board through its link.
  const bobPage = await userPage(browser, 'Боб')
  await bobPage.goto(alicePage.url())
  await expect(bobPage.getByRole('status')).toHaveText('Синхронизировано')

  const aliceParticipants = alicePage.getByRole('list', { name: 'Участники' }).getByRole('listitem')
  const bobParticipants = bobPage.getByRole('list', { name: 'Участники' }).getByRole('listitem')
  await expect(aliceParticipants).toHaveCount(2)
  await expect(bobParticipants).toHaveCount(2)
  await expect(aliceParticipants.first()).toHaveText('Алиса (вы)')
  await expect(aliceParticipants.nth(1)).toHaveText('Боб')
  await expect(bobParticipants.first()).toHaveText('Боб (вы)')

  await bobPage.context().close()
  await expect(aliceParticipants).toHaveCount(1, { timeout: 30_000 })

  await alicePage.context().close()
})

test.describe('signed in', () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context.request, 'Алиса')
  })

  test('the created board appears in the list on the home page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Создать доску' }).click()
    await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}(\?page=[^&]+)?$/)
    const boardUrl = new URL(page.url()).pathname

    await page.getByRole('link', { name: 'CoDraw' }).click()

    await expect(page.locator(`a[href="${boardUrl}"]`)).toHaveText('Новая доска')
  })

  test('shows "Доска не найдена" for an unknown board', async ({ page }) => {
    await page.goto('/boards/0199a000-0000-7000-8000-000000000099')

    await expect(page.getByRole('alert')).toHaveText('Доска не найдена')
  })
})
