import { expect, test, type Page } from '@playwright/test'
import { addShape, createBoard, openBoard, storedVertexCount, userPage, vertices } from './helpers.ts'

/** A PNG of a solid color, drawn by the browser of the page. */
async function picture(page: Page, width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ width, height }) => {
      const canvas = new OffscreenCanvas(width, height)
      const context = canvas.getContext('2d')!
      context.fillStyle = '#2f81f7'
      context.fillRect(0, 0, width, height)
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
      return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    },
    { width, height },
  )
  return Buffer.from(base64, 'base64')
}

const boardIdOf = (page: Page) => new URL(page.url()).pathname.split('/')[2]!

/** The bytes that the browser of the page gets at the address, or the status of a failed answer. */
function download(page: Page, url: string) {
  return page.evaluate(async (url) => {
    const response = await fetch(url)
    return response.ok ? Array.from(new Uint8Array(await response.arrayBuffer())) : response.status
  }, url)
}

test('a copy of a board keeps its shapes and picture apart from the original, and after the original is deleted for good', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Копия')
  const original = await createBoard(alice)
  const originalId = boardIdOf(alice)
  await addShape(alice, 'Прямоугольник')
  const png = await picture(alice, 60, 30)
  await alice.getByLabel('Файлы изображений').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png })
  await expect.poll(async () => (await vertices(alice)).length).toBe(2)
  // The copy takes the document as collab stored it.
  await expect.poll(() => storedVertexCount(originalId)).toBe(2)

  await alice.getByRole('button', { name: 'Меню доски «Новая доска»' }).click()
  await alice.getByRole('menuitem', { name: 'Создать копию' }).click()

  await expect(alice.getByRole('heading', { name: 'Новая доска (копия)', level: 2 })).toBeVisible()
  await expect(alice.getByRole('status')).toHaveText('Синхронизировано')
  const copy = alice.url()
  const copyId = boardIdOf(alice)
  expect(copyId).not.toBe(originalId)
  await expect.poll(async () => (await vertices(alice)).length).toBe(2)
  const image = (await vertices(alice)).find((cell) => cell.style.shape === 'image')!
  expect(image.style.image).toMatch(new RegExp(`^/api/boards/${copyId}/images/`))
  expect(Buffer.from((await download(alice, image.style.image as string)) as number[])).toEqual(png)

  // Changes of the copy stay in it.
  await addShape(alice, 'Эллипс')
  await expect.poll(() => storedVertexCount(copyId)).toBe(3)
  await openBoard(alice, original)
  await expect.poll(async () => (await vertices(alice)).length).toBe(2)

  // The original goes to the trash, then for good with its pictures; the copy keeps its own.
  await alice.getByRole('button', { name: 'Меню доски «Новая доска»' }).click()
  await alice.getByRole('menuitem', { name: 'Удалить доску' }).click()
  await alice.getByRole('alertdialog').getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(alice).toHaveURL(/\/$/)
  await alice.getByRole('button', { name: 'Корзина', exact: true }).click()
  await alice.getByRole('button', { name: 'Удалить окончательно' }).click()
  await alice.getByRole('button', { name: 'Удалить навсегда' }).click()
  await expect(alice.getByText('Корзина пуста')).toBeVisible()

  await openBoard(alice, copy)
  await expect.poll(async () => (await vertices(alice)).length).toBe(3)
  expect(Buffer.from((await download(alice, image.style.image as string)) as number[])).toEqual(png)
  expect(await download(alice, `/api/boards/${originalId}/images/${(image.style.image as string).split('/').pop()}`)).toBe(404)
  await alice.context().close()
})
