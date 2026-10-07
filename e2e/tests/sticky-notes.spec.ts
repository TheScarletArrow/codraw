import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, twoParticipants, userPage, vertices, type CellInfo } from './helpers.ts'

const stickies = async (page: Page) => (await vertices(page)).filter((cell) => cell.style.codrawShape === 'sticky')
const stickyOf = async (page: Page, id: string): Promise<CellInfo | undefined> =>
  (await stickies(page)).find((cell) => cell.id === id)

/** The lines of the label of a cell as the canvas draws them. */
function drawnLines(page: Page, id: string): Promise<string[]> {
  return page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    return String(graph.getView().getState(graph.getDataModel().getCell(id))?.text?.value ?? '').split('\n')
  }, id)
}

/** A point of the canvas of a participant, from its top-left corner. */
async function canvasPoint(page: Page, x: number, y: number) {
  const canvas = (await page.getByTestId('diagram-canvas').boundingBox())!
  return { x: canvas.x + x, y: canvas.y + y }
}

/** Ends editing a label with a click on the empty bottom-left corner of the canvas. */
async function clickEmptyCanvas(page: Page) {
  const canvas = (await page.getByTestId('diagram-canvas').boundingBox())!
  await page.mouse.click(canvas.x + 20, canvas.y + canvas.height - 20)
}

const labelEditor = (page: Page) => page.getByTestId('diagram-canvas').locator('[contenteditable="true"]')
const panel = (page: Page) => page.getByRole('toolbar', { name: 'Стикеры' })

test('N puts a sticky at the pointer and its text is typed at once; the other participant sees it signed, and Ctrl+Z takes it away', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  await clickEmptyCanvas(alice)
  const pointer = await canvasPoint(alice, 400, 260)
  await alice.mouse.move(pointer.x, pointer.y)

  await alice.keyboard.press('n')
  await expect(labelEditor(alice)).toBeFocused()
  await alice.keyboard.type('Медленный CI')
  await clickEmptyCanvas(alice)

  await expect.poll(async () => (await stickies(bob)).map((cell) => cell.value)).toEqual(['Медленный CI'])
  const [sticky] = await stickies(bob)
  expect(sticky).toMatchObject({ width: 160, height: 160 })
  expect(sticky!.style).toMatchObject({ fillColor: '#fff2cc', strokeColor: 'none', fontSize: 20, autosizeText: true })
  // The middle of the sticky is at the pointer, on the grid.
  const box = await cellBox(alice, sticky!.id)
  expect(Math.abs(center(box).x - pointer.x)).toBeLessThanOrEqual(10)
  expect(Math.abs(center(box).y - pointer.y)).toBeLessThanOrEqual(10)
  await expect(bob.getByTestId('sticky-signature')).toHaveText('Алиса')
  await expect(alice.getByTestId('sticky-signature')).toHaveText('Алиса')

  // The sticky and its text are one undo step.
  await alice.keyboard.press('ControlOrMeta+Z')
  await expect.poll(async () => (await stickies(bob)).length).toBe(0)
  await expect(bob.getByTestId('sticky-signature')).toHaveCount(0)

  // In the Russian layout the key of N gives «т»: it adds a sticky all the same, and the letter goes to no text.
  await alice.mouse.move(pointer.x, pointer.y)
  const cdp = await alice.context().newCDPSession(alice)
  for (const type of ['keyDown', 'keyUp'] as const) {
    await cdp.send('Input.dispatchKeyEvent', { type, key: 'т', code: 'KeyN', text: type === 'keyDown' ? 'т' : undefined })
  }
  await expect(labelEditor(alice)).toBeFocused()
  await alice.keyboard.type('Идея')
  await clickEmptyCanvas(alice)
  await expect.poll(async () => (await stickies(bob)).map((cell) => cell.value)).toEqual(['Идея'])

  await close()
})

test('Ctrl and a double click put a sticky; the panel recolors it, a long text wraps and shrinks, and it goes through .drawio', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const spot = await canvasPoint(alice, 300, 220)

  // A double click alone on the empty canvas adds nothing.
  await alice.mouse.dblclick(spot.x, spot.y)
  expect(await stickies(alice)).toEqual([])
  await alice.keyboard.down('ControlOrMeta')
  await alice.mouse.dblclick(spot.x, spot.y)
  await alice.keyboard.up('ControlOrMeta')
  await expect(labelEditor(alice)).toBeFocused()
  const text = 'Сборка идёт двадцать минут, а интеграционные тесты падают через раз из-за общей базы данных'
  await alice.keyboard.type(text)
  await clickEmptyCanvas(alice)

  await expect.poll(async () => (await stickies(bob)).map((cell) => cell.value)).toEqual([text])
  const [sticky] = await stickies(bob)
  // The text wraps by the width of the sticky and is smaller, the same for the other participant.
  expect(sticky!.style.fontSize).toBeLessThan(20)
  expect(sticky!.style.fontSize).toBeGreaterThanOrEqual(6)
  expect((await drawnLines(bob, sticky!.id)).length).toBeGreaterThan(2)
  expect((await stickyOf(alice, sticky!.id))!.style.fontSize).toBe(sticky!.style.fontSize)

  // The panel under the selected sticky recolors it for everybody, in one undo step.
  await alice.mouse.click(center(await cellBox(alice, sticky!.id)).x, center(await cellBox(alice, sticky!.id)).y)
  await expect(panel(alice).getByRole('button', { name: 'Жёлтый' })).toHaveAttribute('aria-pressed', 'true')
  await panel(alice).getByRole('button', { name: 'Розовый' }).click()
  await expect.poll(async () => (await stickyOf(bob, sticky!.id))?.style.fillColor).toBe('#f8cecc')
  await expect(panel(alice).getByRole('button', { name: 'Розовый' })).toHaveAttribute('aria-pressed', 'true')
  await alice.keyboard.press('ControlOrMeta+Z')
  await expect.poll(async () => (await stickyOf(bob, sticky!.id))?.style.fillColor).toBe('#fff2cc')
  await alice.keyboard.press('ControlOrMeta+Shift+Z')
  await expect.poll(async () => (await stickyOf(bob, sticky!.id))?.style.fillColor).toBe('#f8cecc')
  // Without selected stickies there is no panel.
  await clickEmptyCanvas(alice)
  await expect(panel(alice)).toBeHidden()

  // The next sticky takes the chosen color.
  await alice.mouse.move(spot.x + 300, spot.y)
  await alice.keyboard.press('n')
  await alice.keyboard.type('Идея')
  await clickEmptyCanvas(alice)
  await expect.poll(async () => (await stickies(bob)).map((cell) => cell.style.fillColor)).toEqual(['#f8cecc', '#f8cecc'])

  const download = alice.waitForEvent('download')
  await alice.getByRole('button', { name: 'Экспорт в .drawio' }).click()
  const xml = await readFile((await (await download).path())!, 'utf8')
  expect(xml).toContain('autosizeText=1;')
  expect(xml).toContain('fillColor=#f8cecc;')
  expect(xml).not.toContain('Алиса')
  const carol = await userPage(browser, 'Ева')
  await carol.goto('/')
  await carol.getByLabel('Файл draw.io').setInputFiles({ name: 'retro.drawio', mimeType: 'application/xml', buffer: Buffer.from(xml) })
  await expect(carol.getByRole('status')).toHaveText('Синхронизировано')
  await expect.poll(async () => (await stickies(carol)).find((cell) => cell.value === text)?.style).toMatchObject({
    fillColor: '#f8cecc',
    fontSize: sticky!.style.fontSize,
    autosizeText: true,
    whiteSpace: 'wrap',
  })
  // A file does not say who wrote the stickies.
  await expect(carol.getByTestId('sticky-signature')).toHaveCount(0)

  await Promise.all([close(), carol.context().close()])
})

test('the menu of the empty canvas and Ctrl with a double click inside a frame add stickies there', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const spot = await canvasPoint(alice, 360, 240)

  await alice.mouse.click(spot.x, spot.y, { button: 'right' })
  await alice.getByRole('menuitem', { name: 'Добавить стикер' }).click()
  await expect(labelEditor(alice)).toBeFocused()
  await alice.keyboard.type('Ретро')
  await clickEmptyCanvas(alice)

  await expect.poll(async () => (await stickies(bob)).map((cell) => cell.value)).toEqual(['Ретро'])
  const box = await cellBox(alice, (await stickies(alice))[0]!.id)
  expect(Math.abs(center(box).x - spot.x)).toBeLessThanOrEqual(10)
  expect(Math.abs(center(box).y - spot.y)).toBeLessThanOrEqual(10)

  // A frame lets clicks inside it through to the canvas: the sticky goes there, onto the frame.
  const frame = await addShape(alice, 'Граница')
  const inside = center(await cellBox(alice, frame))
  await alice.keyboard.down('ControlOrMeta')
  await alice.mouse.dblclick(inside.x, inside.y)
  await alice.keyboard.up('ControlOrMeta')
  await alice.keyboard.type('В рамке')
  await clickEmptyCanvas(alice)
  await expect.poll(async () => (await stickies(bob)).map((cell) => cell.value)).toEqual(['Ретро', 'В рамке'])
  expect((await vertices(bob)).find((cell) => cell.id === frame)?.value).toBe('Граница')

  await close()
})
