import { expect, test, type Page } from '@playwright/test'
import { addShape, createBoard, storedVertexCount, userPage, vertices } from './helpers.ts'

/** Chooses what the link to the board gives in the «Поделиться» window of its owner. */
async function setLinkAccess(owner: Page, access: RegExp) {
  await owner.getByRole('button', { name: 'Поделиться' }).click()
  const option = owner.getByRole('radio', { name: access })
  const changed = owner.waitForResponse((response) => response.request().method() === 'PATCH' && response.ok())
  await option.check()
  await changed
  await expect(option).toBeChecked()
}

/** A PNG of a solid color, drawn by the browser of the page. */
async function picture(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(40, 20)
    const context = canvas.getContext('2d')!
    context.fillStyle = '#00aa00'
    context.fillRect(0, 0, 40, 20)
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
    return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
  })
  return Buffer.from(base64, 'base64')
}

/** The reader comes back to the tab: the page asks for a newer state of the board. */
const comeBack = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))

test('a board shown to anybody opens through its link without a sign-in, with its pages and images, and follows the changes', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  const url = await createBoard(alice)
  const boardId = url.split('/').pop()!
  await addShape(alice, 'Прямоугольник')
  await alice.getByLabel('Файлы изображений').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await picture(alice) })
  await expect.poll(async () => (await vertices(alice)).length).toBe(2)
  const image = (await vertices(alice)).find((cell) => cell.style.shape === 'image')!.style.image as string
  await alice.getByRole('button', { name: 'Добавить страницу' }).click()
  await expect(alice.getByRole('tab', { name: 'Страница 2', selected: true })).toBeVisible()
  await addShape(alice, 'Прямоугольник')

  await setLinkAccess(alice, /^Все, у кого есть ссылка, без входа/)
  const share = alice.getByRole('region', { name: 'Встроить на страницу' })
  await expect(share.getByRole('textbox', { name: 'Код для встраивания' })).toHaveValue(
    new RegExp(`^<iframe src="[^"]+/view/${boardId}\\?page=[^"]+"`),
  )
  await alice.keyboard.press('Escape')
  await expect.poll(() => storedVertexCount(boardId), { timeout: 15_000 }).toBe(3)

  // A reader without a session opens the usual link of the board.
  const context = await browser.newContext()
  const reader = await context.newPage()
  await reader.goto(url)
  await expect(reader).toHaveURL(new RegExp(`/view/${boardId}`))
  await expect(reader.getByRole('heading', { name: 'Новая доска' })).toBeVisible()
  await expect(reader.getByText('Только просмотр')).toBeVisible()
  await expect.poll(async () => (await vertices(reader)).length).toBe(2)
  expect(await reader.evaluate(async (address) => (await fetch(address)).status, image)).toBe(200)
  await expect(reader.getByRole('link', { name: 'Войти' })).toBeVisible()
  await expect(reader.getByRole('complementary', { name: 'Фигуры' })).toHaveCount(0)
  await expect(reader.getByRole('button', { name: 'Комментарии' })).toHaveCount(0)

  await reader.getByRole('tab', { name: 'Страница 2' }).click()
  await expect.poll(async () => (await vertices(reader)).length).toBe(1)
  await reader.getByRole('button', { name: 'Увеличить' }).click()
  const scale = await reader.getByRole('button', { name: 'Масштаб' }).textContent()

  // The owner changes the page; the reader gets it when they come back to the tab, at the same scale.
  await addShape(alice, 'Прямоугольник')
  await expect.poll(() => storedVertexCount(boardId), { timeout: 15_000 }).toBe(4)
  await comeBack(reader)
  await expect.poll(async () => (await vertices(reader)).length).toBe(2)
  await expect(reader.getByRole('button', { name: 'Масштаб' })).toHaveText(scale!)

  // Nobody was created for the reader.
  expect((await reader.request.get('/api/me')).status()).toBe(401)

  // Once the link no longer shows the board to anybody, the link sends the reader to sign in.
  await setLinkAccess(alice, /^Просмотр/)
  await reader.goto(url)
  await expect(reader).toHaveURL(/\/login$/)

  await Promise.all([alice.context().close(), context.close()])
})
