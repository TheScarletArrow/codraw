import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import {
  cellBox,
  center,
  createBoard,
  csrfHeaders,
  drag,
  openBoard,
  twoParticipants,
  userPage,
  vertices,
} from './helpers.ts'

/** A PNG of a solid color, drawn by the browser of the page. */
async function picture(page: Page, width: number, height: number, color = '#ff0000'): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ width, height, color }) => {
      const canvas = new OffscreenCanvas(width, height)
      const context = canvas.getContext('2d')!
      context.fillStyle = color
      context.fillRect(0, 0, width, height)
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
      return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    },
    { width, height, color },
  )
  return Buffer.from(base64, 'base64')
}

/** The image shapes of the page. */
async function images(page: Page) {
  return (await vertices(page)).filter((cell) => cell.style.shape === 'image')
}

/** The id of the board open on the page. */
const boardIdOf = (page: Page) => new URL(page.url()).pathname.split('/')[2]!

/** Clicks an empty place of the canvas, so that the keys go to it. */
async function focusCanvas(page: Page) {
  await page.getByTestId('diagram-canvas').click({ position: { x: 40, y: 40 } })
}

/** Adds image files with «Изображение» of the shape panel. */
async function addFromPanel(page: Page, ...files: { name: string; buffer: Buffer }[]) {
  await page.getByLabel('Файлы изображений').setInputFiles(files.map((file) => ({ ...file, mimeType: 'image/png' })))
}

/** Whether the browser of the page gets the picture at the address, as a PNG. */
function loads(page: Page, url: string) {
  return page.evaluate(async (url) => {
    const response = await fetch(url)
    return `${response.status} ${response.headers.get('content-type')}`
  }, url)
}

test('a pasted screenshot becomes an image shape that the other participant sees, and Ctrl+Z takes it away', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  await alice.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const png = await picture(alice, 400, 200)
  await focusCanvas(alice)
  await alice.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })])
  }, png.toString('base64'))

  await alice.keyboard.press('Control+v')

  await expect.poll(async () => (await images(alice)).length).toBe(1)
  const [image] = await images(alice)
  expect(image!.style).toMatchObject({ aspect: 'fixed', imageAspect: false })
  expect(image!.style.image).toMatch(new RegExp(`^/api/boards/${boardIdOf(alice)}/images/[0-9a-f-]{36}$`))
  expect([image!.width, image!.height]).toEqual([400, 200])
  await expect.poll(async () => (await images(bob)).map((cell) => cell.style.image)).toEqual([image!.style.image])
  expect(await loads(bob, image!.style.image as string)).toBe('200 image/png')
  // The canvas shows the picture, not the placeholder.
  const shown = bob.getByTestId('diagram-canvas').locator('image')
  await expect(shown).toHaveAttribute('xlink:href', new RegExp(`/api/boards/${boardIdOf(alice)}/images/`))
  await shown.evaluate((element) => {
    const image = new Image()
    image.src = element.getAttribute('xlink:href')!
    return image.decode()
  })
  await expect(shown).toHaveAttribute('xlink:href', /\/api\/boards\//)

  await alice.keyboard.press('Control+z')

  await expect.poll(async () => (await images(alice)).length).toBe(0)
  await expect.poll(async () => (await images(bob)).length).toBe(0)
  await close()
})

test('images are dropped at a point and added from the panel in a row, and resizing keeps their proportions', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  const canvas = alice.getByTestId('diagram-canvas')
  const box = (await canvas.boundingBox())!
  const point = { x: box.x + 300, y: box.y + 250 }
  const files = await alice.evaluateHandle(
    ({ base64 }) => {
      const transfer = new DataTransfer()
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
      transfer.items.add(new File([bytes], 'logo.png', { type: 'image/png' }))
      return transfer
    },
    { base64: (await picture(alice, 120, 60, '#0000ff')).toString('base64') },
  )

  await canvas.dispatchEvent('dragover', { dataTransfer: files, clientX: point.x, clientY: point.y })
  await canvas.dispatchEvent('drop', { dataTransfer: files, clientX: point.x, clientY: point.y })

  await expect.poll(async () => (await images(alice)).length).toBe(1)
  const [dropped] = await images(alice)
  const droppedCenter = center(await cellBox(alice, dropped!.id))
  expect(Math.abs(droppedCenter.x - point.x)).toBeLessThanOrEqual(10)
  expect(Math.abs(droppedCenter.y - point.y)).toBeLessThanOrEqual(10)

  await addFromPanel(
    alice,
    { name: 'a.png', buffer: await picture(alice, 200, 100, '#00ff00') },
    { name: 'b.png', buffer: await picture(alice, 50, 50, '#ffff00') },
  )
  await expect.poll(async () => (await images(alice)).length).toBe(3)
  const [, first, second] = await images(alice)
  expect([first!.width, first!.height, second!.width, second!.height]).toEqual([200, 100, 50, 50])
  expect(second!.x).toBe(first!.x + 200 + 20)

  // The bottom-right handle of the selected image, dragged down and a little to the side: the width follows.
  const shape = await cellBox(alice, first!.id)
  await alice.mouse.click(shape.x + shape.width / 2, shape.y + shape.height / 2)
  await drag(alice, { x: shape.x + shape.width, y: shape.y + shape.height }, { x: shape.x + shape.width + 10, y: shape.y + shape.height + 50 })

  await expect.poll(async () => (await images(alice)).find((cell) => cell.id === first!.id)!.width).toBeGreaterThan(250)
  const resized = (await images(alice)).find((cell) => cell.id === first!.id)!
  expect(resized.width / resized.height).toBeCloseTo(2, 1)
  await alice.context().close()
})

test('a .drawio file carries the picture, and the picture is stored on the board that imports the file', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  const png = await picture(alice, 80, 40)
  await addFromPanel(alice, { name: 'logo.png', buffer: png })
  await expect.poll(async () => (await images(alice)).length).toBe(1)

  const download = alice.waitForEvent('download')
  await alice.getByRole('button', { name: 'Экспорт в .drawio' }).click()
  const xml = await readFile((await (await download).path())!, 'utf8')

  // As draw.io writes pictures: without `;base64`, which would end the value in a style.
  expect(xml).toContain(`image=data:image/png,${png.toString('base64')};`)
  expect(xml).not.toContain('/api/boards/')

  const eva = await userPage(browser, 'Ева')
  await eva.goto('/')
  await eva.getByLabel('Файл draw.io').setInputFiles({ name: 'Логотип.drawio', mimeType: 'application/vnd.jgraph.mxfile', buffer: Buffer.from(xml) })
  await expect(eva.getByRole('heading', { name: 'Логотип', level: 2 })).toBeVisible()
  await expect(eva.getByRole('status')).toHaveText('Синхронизировано')

  await expect.poll(async () => (await images(eva)).length).toBe(1)
  const [imported] = await images(eva)
  expect(imported!.style.image).toMatch(new RegExp(`^/api/boards/${boardIdOf(eva)}/images/`))
  const bytes = await eva.evaluate(async (url) => Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())), imported!.style.image as string)
  expect(Buffer.from(bytes)).toEqual(png)
  await Promise.all([alice.context().close(), eva.context().close()])
})

test('PNG and SVG of a page carry its pictures', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  await addFromPanel(alice, { name: 'red.png', buffer: await picture(alice, 100, 100) })
  await expect.poll(async () => (await images(alice)).length).toBe(1)
  const dialog = async () => {
    await alice.getByRole('button', { name: 'Экспорт в изображение' }).click()
    return alice.getByRole('dialog', { name: 'Экспорт в изображение' })
  }

  let download = alice.waitForEvent('download')
  await (await dialog()).getByRole('button', { name: 'Сохранить SVG' }).click()
  const svg = await readFile((await (await download).path())!, 'utf8')
  await alice.keyboard.press('Escape')

  expect(svg).toMatch(/<image [^>]*href="data:image\/png;base64,/)
  expect(svg).not.toContain('/api/boards/')

  download = alice.waitForEvent('download')
  await (await dialog()).getByRole('button', { name: 'Сохранить PNG' }).click()
  const png = await readFile((await (await download).path())!)
  const red = await alice.evaluate(async (base64) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    const canvas = new OffscreenCanvas(image.width, image.height)
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, image.width, image.height)
    let count = 0
    for (let i = 0; i < data.length; i += 4) if (data[i]! > 200 && data[i + 1]! < 60 && data[i + 2]! < 60) count++
    return count
  }, png.toString('base64'))
  // 100 × 100 at 2×.
  expect(red).toBeGreaterThan(30_000)
  await alice.context().close()
})

test('nobody without access gets the pictures, a viewer adds none, and a file above the limit is not sent', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  const url = await createBoard(alice)
  const boardId = boardIdOf(alice)
  await addFromPanel(alice, { name: 'logo.png', buffer: await picture(alice, 30, 30) })
  await expect.poll(async () => (await images(alice)).length).toBe(1)
  const [image] = await images(alice)
  const access = async (linkAccess: string) => {
    const response = await alice.request.patch(`/api/boards/${boardId}`, { data: { linkAccess }, headers: await csrfHeaders(alice.request) })
    expect(response.status()).toBe(200)
  }

  await access('none')
  const carol = await userPage(browser, 'Карина')
  expect((await carol.request.get(image!.style.image as string)).status()).toBe(403)

  await access('view')
  const bob = await userPage(browser, 'Боб')
  await openBoard(bob, url)
  await expect(bob.getByText('Только просмотр')).toBeVisible()
  expect(await loads(bob, image!.style.image as string)).toBe('200 image/png')
  await expect(bob.getByRole('complementary', { name: 'Фигуры' })).toHaveCount(0)
  const refused = await bob.request.post(`/api/boards/${boardId}/images`, {
    data: await picture(bob, 10, 10),
    headers: { ...(await csrfHeaders(bob.request)), 'Content-Type': 'application/octet-stream' },
  })
  expect(refused.status()).toBe(403)

  // The e2e backend takes files up to 1 MB.
  await addFromPanel(alice, { name: 'huge.png', buffer: Buffer.alloc(1536 * 1024) })
  await expect(alice.getByRole('alert')).toHaveText(/Изображение больше 1 МБ/)
  await alice.getByRole('button', { name: 'Понятно' }).click()
  await expect(alice.getByRole('alert')).toHaveCount(0)
  expect(await images(alice)).toHaveLength(1)
  await Promise.all([alice.context().close(), bob.context().close(), carol.context().close()])
})
