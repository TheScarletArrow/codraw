import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, drag, twoParticipants, vertices } from './helpers.ts'

interface Point {
  x: number
  y: number
}

/** The lines drawn by hand on the canvas of the participant: their ids, styles and points from start to end. */
function freehandLines(page: Page): Promise<{ id: string; style: Record<string, unknown>; points: Point[] }[]> {
  return page.evaluate(() => {
    // Mirrors EDITOR_PROPERTY in frontend/src/diagram/editor.ts.
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    return graph
      .getDefaultParent()
      .getChildren()
      .filter((cell: any) => cell.isEdge() && cell.getStyle().codrawFreehand)
      .map((cell: any) => {
        const geometry = cell.getGeometry()
        const points = [geometry.sourcePoint, ...(geometry.points ?? []), geometry.targetPoint]
        return { id: cell.getId(), style: { ...cell.getStyle() }, points: points.map(({ x, y }: Point) => ({ x, y })) }
      })
  })
}

/** Where a point of the diagram is on the page. */
function onPage(page: Page, point: Point): Promise<Point> {
  return page.evaluate((point) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as HTMLElement & Record<string, any>
    const rect = container.getBoundingClientRect()
    const { x, y } = container.__codrawEditor.toCanvasPoint(point)
    return { x: rect.left + x, y: rect.top + y }
  }, point)
}

/** How many cells the canvas of the participant selects. */
function selectionCount(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    return container.__codrawEditor.graph.getSelectionCount() as number
  })
}

/** Draws a wave with the mouse, 240 pixels to the right of `from`. */
async function drawWave(page: Page, from: Point) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let step = 1; step <= 30; step++) {
    await page.mouse.move(from.x + step * 8, from.y + Math.round(30 * Math.sin(step / 3)))
  }
  await page.mouse.up()
}

test('a participant draws by hand: everybody sees the line, which moves, goes and comes back as one element', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const shape = await addShape(alice, 'Прямоугольник')
  const canvas = (await alice.getByTestId('diagram-canvas').boundingBox())!
  await alice.mouse.click(canvas.x + 20, canvas.y + canvas.height - 20)
  const placed = (await vertices(alice)).find((cell) => cell.id === shape)!

  // Alice turns the pencil on and picks red in «Линия», which replaces the tools of the selection meanwhile.
  const pencil = alice.getByRole('button', { name: 'Карандаш', exact: true })
  await pencil.click()
  await expect(pencil).toHaveAttribute('aria-pressed', 'true')
  await alice.getByRole('button', { name: 'Цвет линии' }).click()
  await alice.getByRole('button', { name: 'Красный' }).click()

  // A wave from the shape: Bob sees one red line through the same points, the shape stays where it was, and nothing is
  // selected.
  const box = await cellBox(alice, shape)
  await drawWave(alice, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  await expect.poll(async () => (await freehandLines(bob)).length).toBe(1)
  const [line] = await freehandLines(alice)
  expect(line!.style).toMatchObject({ curved: true, edgeStyle: 'none', endArrow: 'none', strokeColor: '#b85450', strokeWidth: 2 })
  // The path is simplified: fewer points than the moves of the mouse.
  expect(line!.points.length).toBeGreaterThan(4)
  expect(line!.points.length).toBeLessThan(31)
  expect((await freehandLines(bob))[0]!.points).toEqual(line!.points)
  expect((await vertices(alice)).find((cell) => cell.id === shape)).toMatchObject({ x: placed.x, y: placed.y })
  expect(await selectionCount(alice)).toBe(0)

  // The pencil stays on for the next line; Ctrl+Z takes that line back as a whole, for Bob too.
  await drawWave(alice, { x: canvas.x + 40, y: canvas.y + canvas.height - 80 })
  await expect.poll(async () => (await freehandLines(bob)).length).toBe(2)
  await alice.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await freehandLines(bob)).map((other) => other.id)).toEqual([line!.id])

  // Escape turns the pencil off; a click on the line selects it, and dragging moves all of it.
  await alice.keyboard.press('Escape')
  await expect(pencil).toHaveAttribute('aria-pressed', 'false')
  const [, second, third] = line!.points
  const onLine = await onPage(alice, { x: (second!.x + third!.x) / 2, y: (second!.y + third!.y) / 2 })
  await alice.mouse.click(onLine.x, onLine.y)
  await expect.poll(() => selectionCount(alice)).toBe(1)
  await drag(alice, onLine, { x: onLine.x + 100, y: onLine.y + 60 })
  await expect.poll(async () => (await freehandLines(bob))[0]!.points[0]!.x).not.toBe(line!.points[0]!.x)
  const moved = (await freehandLines(bob))[0]!.points
  const dx = moved[0]!.x - line!.points[0]!.x
  const dy = moved[0]!.y - line!.points[0]!.y
  expect(Math.abs(dx - 100)).toBeLessThanOrEqual(10)
  expect(Math.abs(dy - 60)).toBeLessThanOrEqual(10)
  expect(moved).toEqual(line!.points.map(({ x, y }) => ({ x: x + dx, y: y + dy })))

  // Delete removes it, Ctrl+Z brings it back.
  await alice.keyboard.press('Delete')
  await expect.poll(async () => (await freehandLines(bob)).length).toBe(0)
  await alice.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await freehandLines(bob)).length).toBe(1)

  // The exported file has the line as a curved edge of draw.io without ends; imported, it is a line drawn by hand again.
  const download = alice.waitForEvent('download')
  await alice.getByRole('button', { name: 'Экспорт в .drawio' }).click()
  const file = await download
  const xml = await readFile((await file.path())!, 'utf8')
  expect(xml).toContain('codrawFreehand=1;edgeStyle=none;curved=1;endArrow=none;strokeColor=#b85450;strokeWidth=2;')
  expect(xml).toContain('as="sourcePoint"')
  await alice.getByLabel('Файл draw.io').setInputFiles({
    name: 'Копия.drawio',
    mimeType: 'application/vnd.jgraph.mxfile',
    buffer: Buffer.from(xml),
  })
  await expect(alice.getByRole('tablist', { name: 'Страницы' }).getByRole('tab')).toHaveCount(2)
  await expect.poll(async () => (await freehandLines(alice)).map(({ points }) => points)).toEqual([moved])
  expect((await freehandLines(alice))[0]!.style).toMatchObject({ codrawFreehand: true, strokeColor: '#b85450' })

  // The SVG of the page draws the line as a red curve.
  await alice.getByRole('button', { name: 'Экспорт в изображение' }).click()
  const dialog = alice.getByRole('dialog', { name: 'Экспорт в изображение' })
  const image = alice.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Сохранить SVG' }).click()
  const svg = await readFile((await (await image).path())!, 'utf8')
  expect(svg).toMatch(/<path [^>]*d="M [^"]* Q [^"]*"[^>]*stroke="#b85450"/)

  await close()
})
