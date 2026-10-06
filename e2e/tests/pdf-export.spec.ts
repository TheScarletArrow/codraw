import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'
import { addShape, createBoard, csrfHeaders, openBoard, userPage } from './helpers.ts'

/** Saves a file through «Экспорт в изображение» with the PDF pages chosen, and returns it with its name. */
async function save(page: Page, format: 'SVG' | 'PDF', pages: 'Текущая страница' | 'Все страницы' = 'Текущая страница') {
  await page.getByRole('button', { name: 'Экспорт в изображение' }).click()
  const dialog = page.getByRole('dialog', { name: 'Экспорт в изображение' })
  const pdfPages = dialog.getByRole('combobox', { name: 'Страницы PDF' })
  if (await pdfPages.isEnabled()) await pdfPages.selectOption({ label: pages })
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: `Сохранить ${format}` }).click()
  const file = await download
  const bytes = await readFile((await file.path())!)
  await page.keyboard.press('Escape')
  return { name: file.suggestedFilename(), bytes }
}

/** Width and height of the root element of an SVG file. */
function svgSize(bytes: Buffer) {
  const [, width, height] = /<svg[^>]* width="(\d+)" height="(\d+)"/.exec(bytes.toString('utf8'))!
  return { width: Number(width), height: Number(height) }
}

/**
 * What a test needs to know of a PDF: the sizes of its pages in points, in their order, how many fonts it embeds and
 * the letters that its text maps back to, from the ToUnicode maps of its fonts.
 */
function readPdf(bytes: Buffer) {
  const raw = bytes.toString('latin1')
  expect(raw.startsWith('%PDF-')).toBe(true)
  const pages = Array.from(raw.matchAll(/\/Type \/Page\b(?!s)[^>]*?\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g), ([, width, height]) => ({
    width: Number(width),
    height: Number(height),
  }))
  const streams = Array.from(raw.matchAll(/<<([^<>]*\/FlateDecode[^<>]*)>>\s*stream\r?\n/g), (match) => {
    const start = match.index + match[0].length
    const length = Number(/\/Length (\d+)/.exec(match[1]!)![1])
    return inflateSync(bytes.subarray(start, start + length)).toString('latin1')
  })
  // Pairs of a glyph and the letter it is, e.g. `<03d2><0421>` for «С».
  const letters = new Set(
    streams
      .flatMap((stream) => Array.from(stream.matchAll(/beginbfchar([\s\S]*?)endbfchar/g), ([, pairs]) => pairs!))
      .flatMap((pairs) => Array.from(pairs.matchAll(/<[0-9a-f]+>\s*<([0-9a-f]{4})>/gi), ([, code]) => code!))
      .map((code) => String.fromCharCode(parseInt(code, 16))),
  )
  return { pages, embeddedFonts: raw.match(/\/FontFile2/g)?.length ?? 0, letters, size: bytes.length }
}

/** Whether every letter of the text is in the PDF as text. */
const hasText = (pdf: ReturnType<typeof readPdf>, text: string) => [...text.replace(/\s/g, '')].every((letter) => pdf.letters.has(letter))

test('a page is saved as a vector PDF of the size of its SVG, with the labels as text in embedded fonts', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await createBoard(alice)
  await addShape(alice, 'Сервис')
  await addShape(alice, 'База данных')

  const svg = await save(alice, 'SVG')
  const file = await save(alice, 'PDF')

  expect(file.name).toBe('Новая доска.pdf')
  const pdf = readPdf(file.bytes)
  expect(pdf.pages).toEqual([svgSize(svg.bytes)])
  expect(pdf.embeddedFonts).toBeGreaterThan(0)
  expect(hasText(pdf, 'Сервис')).toBe(true)
  expect(hasText(pdf, 'База данных')).toBe(true)
  // The fonts carry only the letters of the labels.
  expect(pdf.size).toBeLessThan(100_000)

  await alice.context().close()
})

/** A board with «Сервис» on its first page and «База данных» and a rectangle on the second; returns its address. */
async function boardOfTwoPages(page: Page) {
  const url = await createBoard(page)
  await addShape(page, 'Сервис')
  await page.getByRole('button', { name: 'Добавить страницу' }).click()
  await expect(page.getByRole('tab', { name: 'Страница 2', exact: true })).toHaveAttribute('aria-selected', 'true')
  await addShape(page, 'База данных')
  await addShape(page, 'Прямоугольник')
  return url
}

test('all pages of a board go into one PDF, a page of its own size each, named after the board', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await boardOfTwoPages(alice)
  const second = svgSize((await save(alice, 'SVG')).bytes)
  await alice.getByRole('tab', { name: 'Страница 1', exact: true }).click()
  const first = svgSize((await save(alice, 'SVG')).bytes)
  expect(second).not.toEqual(first)

  const current = await save(alice, 'PDF')
  const all = await save(alice, 'PDF', 'Все страницы')

  expect(current.name).toBe('Новая доска — Страница 1.pdf')
  expect(readPdf(current.bytes).pages).toEqual([first])
  expect(all.name).toBe('Новая доска.pdf')
  const pdf = readPdf(all.bytes)
  expect(pdf.pages).toEqual([first, second])
  // The second page was drawn out of sight.
  expect(hasText(pdf, 'Сервис База данных')).toBe(true)

  await alice.context().close()
})

test('a viewer saves the PDF of all pages', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await boardOfTwoPages(alice)
  const boardId = new URL(url).pathname.split('/').pop()!
  const response = await alice.request.patch(`/api/boards/${boardId}`, {
    data: { linkAccess: 'view' },
    headers: await csrfHeaders(alice.request),
  })
  expect(response.status()).toBe(200)

  await openBoard(bob, url)
  await expect(bob.getByText('Только просмотр')).toBeVisible()
  const file = await save(bob, 'PDF', 'Все страницы')

  expect(file.name).toBe('Новая доска.pdf')
  expect(readPdf(file.bytes).pages).toHaveLength(2)

  await Promise.all([alice.context().close(), bob.context().close()])
})
