import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { addShape, cellBox, createBoard, csrfHeaders, openBoard, twoParticipants, userPage } from './helpers.ts'

/** Saves an image through «Экспорт в изображение» and returns the saved file and its name. */
async function saveImage(page: Page, format: 'PNG' | 'SVG', { selectionOnly = false } = {}) {
  await page.getByRole('button', { name: 'Экспорт в изображение' }).click()
  const dialog = page.getByRole('dialog', { name: 'Экспорт в изображение' })
  if (selectionOnly) await dialog.getByRole('checkbox', { name: 'Только выделенное' }).check()
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: `Сохранить ${format}` }).click()
  const file = await download
  const bytes = await readFile((await file.path())!)
  await page.keyboard.press('Escape')
  return { name: file.suggestedFilename(), bytes }
}

/** Width and height from the IHDR chunk of a PNG file. */
function pngSize(bytes: Buffer) {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/** Width and height of the root element of an SVG file. */
function svgSize(svg: string) {
  const [, width, height] = /<svg[^>]* width="(\d+)" height="(\d+)"/.exec(svg)!
  return { width: Number(width), height: Number(height) }
}

/** Counts the dark pixels of a PNG, drawn by the browser: the lines and labels of the diagram. */
function darkPixels(page: Page, bytes: Buffer) {
  return page.evaluate(async (base64) => {
    const picture = new Image()
    picture.src = `data:image/png;base64,${base64}`
    await picture.decode()
    const canvas = document.createElement('canvas')
    canvas.width = picture.width
    canvas.height = picture.height
    const context = canvas.getContext('2d')!
    context.drawImage(picture, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let dark = 0
    for (let i = 0; i < data.length; i += 4) if (data[i]! < 100 && data[i + 1]! < 100 && data[i + 2]! < 100) dark++
    return dark
  }, bytes.toString('base64'))
}

test('a page is saved as PNG twice the size of its diagram with margins, whatever the zoom of the canvas', async ({
  browser,
}) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  await addShape(alice, 'Прямоугольник')
  await addShape(alice, 'Эллипс')

  const svg = await saveImage(alice, 'SVG')
  const png = await saveImage(alice, 'PNG')

  expect(png.name).toBe('Новая доска.png')
  const size = svgSize(svg.bytes.toString('utf8'))
  expect(pngSize(png.bytes)).toEqual({ width: size.width * 2, height: size.height * 2 })
  expect(await darkPixels(alice, png.bytes)).toBeGreaterThan(100)

  await alice.getByRole('button', { name: 'Увеличить', exact: true }).click()
  await alice.getByRole('button', { name: 'Увеличить', exact: true }).click()
  await alice.getByTestId('diagram-canvas').evaluate((canvas) => canvas.scrollBy(40, 30))
  expect(pngSize((await saveImage(alice, 'PNG')).bytes)).toEqual({ width: size.width * 2, height: size.height * 2 })

  await alice.context().close()
})

test('SVG keeps the labels as text, without the selection or the cursors of others', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  await addShape(alice, 'Сервис')
  await addShape(alice, 'База данных')
  const canvas = (await bob.getByTestId('diagram-canvas').boundingBox())!
  await bob.mouse.move(canvas.x + 300, canvas.y + 200, { steps: 3 })
  await expect(alice.getByTestId('remote-cursor')).toBeVisible()

  const page = await saveImage(alice, 'SVG')

  const svg = page.bytes.toString('utf8')
  expect(page.name).toBe('Новая доска.svg')
  expect(svg).toContain('>Сервис<')
  expect(svg).toContain('>База данных<')
  // The selected «База данных» has handles on the canvas, the cursor of Боб is shown over it.
  expect(svg).not.toContain('Боб')
  expect(svg).not.toMatch(/cursor|pointer-events="all"/)

  await close()
})

test('«Только выделенное» saves the selected shape only', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  const service = await addShape(alice, 'Сервис')
  await addShape(alice, 'База данных')
  // The new shape cascades over the previous one: a click at the corner of «Сервис» selects it, not «База данных».
  const box = await cellBox(alice, service)
  await alice.mouse.click(box.x + 5, box.y + 5)

  const all = svgSize((await saveImage(alice, 'SVG')).bytes.toString('utf8'))
  const selected = (await saveImage(alice, 'SVG', { selectionOnly: true })).bytes.toString('utf8')

  expect(selected).toContain('>Сервис<')
  expect(selected).not.toContain('База данных')
  expect(svgSize(selected).width).toBeLessThan(all.width)

  await alice.context().close()
})

test('a viewer saves the page as PNG', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await createBoard(alice)
  await addShape(alice, 'Прямоугольник')
  const boardId = new URL(url).pathname.split('/').pop()!
  const response = await alice.request.patch(`/api/boards/${boardId}`, {
    data: { linkAccess: 'view' },
    headers: await csrfHeaders(alice.request),
  })
  expect(response.status()).toBe(200)

  await openBoard(bob, url)
  await expect(bob.getByText('Только просмотр')).toBeVisible()
  const png = await saveImage(bob, 'PNG')

  expect(png.name).toBe('Новая доска.png')
  expect(pngSize(png.bytes).width).toBeGreaterThan(0)

  await Promise.all([alice.context().close(), bob.context().close()])
})
