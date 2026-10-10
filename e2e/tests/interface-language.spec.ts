import { expect, test } from '@playwright/test'

test('CoDraw speaks the language of the browser, and «Язык» switches it for good and for the letters', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'en-US' })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.getByRole('button', { name: 'Continue without signing in' }).click()
  const header = page.getByRole('banner')
  await expect(header).toContainText(/Guest \d{1,3}/)
  await expect(header.getByRole('link', { name: 'Sign in' })).toBeVisible()

  await page.getByRole('button', { name: 'Create board' }).click()
  await expect(page.getByRole('status')).toHaveText('Synced')
  await expect(page.getByRole('heading', { name: 'New board' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Participants' })).toHaveText(/^Guest \d{1,3} \(you\)$/)
  await expect(page.getByRole('complementary', { name: 'Shapes' }).getByRole('button', { name: 'Rectangle', exact: true })).toBeVisible()
  const language = async () => ((await (await page.request.get('/api/me')).json()) as { language: string }).language
  await expect.poll(language).toBe('en')

  await header.getByRole('button', { name: 'Language: English' }).click()
  // The choice reloads the page in Russian.
  await page.getByRole('dialog', { name: 'Language' }).getByRole('radio', { name: 'Русский' }).click()

  await expect(page.getByRole('status')).toHaveText('Синхронизировано')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  await expect(header.getByRole('button', { name: 'Язык: Русский' })).toBeVisible()
  await expect(
    page.getByRole('complementary', { name: 'Фигуры' }).getByRole('button', { name: 'Прямоугольник', exact: true }),
  ).toBeVisible()
  // The board keeps its title: it is content, not a text of the interface.
  await expect(page.getByRole('heading', { name: 'New board' })).toBeVisible()
  await expect.poll(language).toBe('ru')

  // The browser remembers the choice whatever its languages are.
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Создать доску' })).toBeVisible()
  await context.close()
})
