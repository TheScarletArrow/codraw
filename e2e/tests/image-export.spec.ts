import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import {
  addShape,
  cellBox,
  connect,
  createBoard,
  csrfHeaders,
  drag,
  edges,
  openBoard,
  twoParticipants,
  userPage,
  vertices,
} from './helpers.ts'

interface ExportOptions {
  selectionOnly?: boolean
  transparent?: boolean
  scale?: '1×' | '2×' | '3×' | '4×'
}

/** Opens «Экспорт в изображение» and sets its options. */
async function openExport(page: Page, { selectionOnly = false, transparent = false, scale }: ExportOptions = {}) {
  await page.getByRole('button', { name: 'Экспорт в изображение' }).click()
  const dialog = page.getByRole('dialog', { name: 'Экспорт в изображение' })
  await dialog.getByRole('checkbox', { name: 'Только выделенное' }).setChecked(selectionOnly)
  await dialog.getByRole('checkbox', { name: 'Прозрачный фон' }).setChecked(transparent)
  if (scale) await dialog.getByRole('combobox', { name: 'Масштаб PNG' }).selectOption({ label: scale })
  return dialog
}

/** Saves an image through «Экспорт в изображение» and returns the saved file and its name. */
async function saveImage(page: Page, format: 'PNG' | 'SVG', options: ExportOptions = {}) {
  const dialog = await openExport(page, options)
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

/** Counts the dark pixels of a PNG, drawn by the browser, and reads the alpha of its top-left pixel. */
function pngPixels(page: Page, bytes: Buffer) {
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
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! > 200 && data[i]! < 100 && data[i + 1]! < 100 && data[i + 2]! < 100) dark++
    }
    return { dark, cornerAlpha: data[3]! }
  }, bytes.toString('base64'))
}

test('a page is saved as PNG in the chosen scale of its diagram with margins, whatever the zoom of the canvas', async ({
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
  const pixels = await pngPixels(alice, png.bytes)
  expect(pixels.dark).toBeGreaterThan(100)
  expect(pixels.cornerAlpha).toBe(255)
  expect(pngSize((await saveImage(alice, 'PNG', { scale: '3×' })).bytes)).toEqual({
    width: size.width * 3,
    height: size.height * 3,
  })

  await alice.getByRole('button', { name: 'Увеличить', exact: true }).click()
  await alice.getByRole('button', { name: 'Увеличить', exact: true }).click()
  await alice.getByTestId('diagram-canvas').evaluate((canvas) => canvas.scrollBy(40, 30))
  expect(pngSize((await saveImage(alice, 'PNG', { scale: '2×' })).bytes)).toEqual({
    width: size.width * 2,
    height: size.height * 2,
  })

  await alice.context().close()
})

test('a transparent PNG has no background outside the shapes', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  await addShape(alice, 'Прямоугольник')

  const png = await saveImage(alice, 'PNG', { transparent: true })

  const pixels = await pngPixels(alice, png.bytes)
  expect(pixels.cornerAlpha).toBe(0)
  expect(pixels.dark).toBeGreaterThan(100)

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
  expect(selected).not.toContain('>База данных<')
  expect(svgSize(selected).width).toBeLessThan(all.width)

  await alice.context().close()
})

test('a saved SVG opens again for editing: its import adds a page with the shapes and the edge', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  const service = await addShape(alice, 'Прямоугольник')
  const database = await addShape(alice, 'Эллипс')
  // The new shape cascades over the previous one: moved away, the edge between them is long enough to drag.
  const box = await cellBox(alice, database)
  await drag(alice, { x: box.x + 15, y: box.y + 15 }, { x: box.x + 215, y: box.y + 15 })
  await connect(alice, service, database)
  await expect.poll(async () => (await edges(alice)).length).toBe(1)
  const svg = await saveImage(alice, 'SVG')

  await createBoard(alice)
  await alice.getByLabel('Файл draw.io').setInputFiles({ name: svg.name, mimeType: 'image/svg+xml', buffer: svg.bytes })

  // The only page of a new board is empty, so the page of the file takes its place.
  await expect(alice.getByRole('tablist', { name: 'Страницы' }).getByRole('tab')).toHaveCount(1)
  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.id).sort()).toEqual([service, database].sort())
  expect((await edges(alice)).map(({ source, target }) => ({ source, target }))).toEqual([
    { source: service, target: database },
  ])

  await alice.context().close()
})

test('«Копировать PNG» puts the image of the page into the clipboard', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await alice.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await createBoard(alice)
  await addShape(alice, 'Прямоугольник')

  const dialog = await openExport(alice)
  await dialog.getByRole('button', { name: 'Копировать PNG' }).click()

  await expect(dialog.getByText('Изображение скопировано')).toBeVisible()
  const copied = await alice.evaluate(async () => {
    const [item] = await navigator.clipboard.read()
    const blob = await item!.getType('image/png')
    return { types: item!.types, size: blob.size }
  })
  expect(copied.types).toContain('image/png')
  expect(copied.size).toBeGreaterThan(100)

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
