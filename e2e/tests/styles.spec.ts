import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, cells, center, connect, drag, edges, twoParticipants, userPage, vertices } from './helpers.ts'

/** Selects a cell with a click on it. */
async function select(page: Page, id: string) {
  const box = await cellBox(page, id)
  await page.mouse.click(box.x + 5, box.y + box.height / 2)
}

const styleOf = async (page: Page, id: string) => (await cells(page)).find((cell) => cell.id === id)?.style

test('line and text styles reach the other participant and survive a .drawio file', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const client = await addShape(alice, 'Прямоугольник')
  const server = await addShape(alice, 'Эллипс')
  const box = await cellBox(alice, server)
  await drag(alice, center(box), { x: center(box).x + 250, y: center(box).y + 120 })
  await connect(alice, client, server)
  await expect.poll(async () => (await edges(alice)).length).toBe(1)
  const edge = (await edges(alice))[0]!.id

  // A dashed curved edge of width 3.
  await alice.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    graph.setSelectionCell(graph.getDataModel().getCell(id))
  }, edge)
  await alice.getByRole('button', { name: 'Стиль линии' }).click()
  const panel = alice.getByRole('dialog', { name: 'Стиль линии' })
  await panel.getByRole('button', { name: 'Пунктир' }).click()
  await panel.getByRole('button', { name: 'Кривая' }).click()
  await panel.getByRole('spinbutton', { name: 'Толщина линии' }).fill('3')
  await panel.getByRole('spinbutton', { name: 'Толщина линии' }).press('Enter')
  await alice.keyboard.press('Escape')

  // A bold label on the left, with the keyboard and the toolbar.
  await select(alice, client)
  await alice.keyboard.press('Control+B')
  await alice.getByRole('button', { name: 'Текст по левому краю' }).click()

  await expect.poll(() => styleOf(bob, edge)).toMatchObject({ dashed: true, curved: true, strokeWidth: 3 })
  await expect.poll(() => styleOf(bob, client)).toMatchObject({ fontStyle: 1, align: 'left' })

  const download = alice.waitForEvent('download')
  await alice.getByRole('button', { name: 'Экспорт в .drawio' }).click()
  const file = await download
  const xml = await readFile((await file.path())!, 'utf8')
  const carol = await userPage(browser, 'Ева')
  await carol.goto('/')
  await carol.getByLabel('Файл draw.io').setInputFiles({ name: 'styles.drawio', mimeType: 'application/xml', buffer: Buffer.from(xml) })
  await expect(carol.getByRole('status')).toHaveText('Синхронизировано')
  await expect.poll(async () => (await vertices(carol)).length).toBe(2)

  expect(await styleOf(carol, edge)).toMatchObject({ dashed: true, curved: true, strokeWidth: 3 })
  expect(await styleOf(carol, client)).toMatchObject({ fontStyle: 1, align: 'left' })

  await Promise.all([close(), carol.context().close()])
})

test('a bold label widens a shape with auto width', async ({ browser }) => {
  const { alice, close } = await twoParticipants(browser)
  const text = await addShape(alice, 'Текст')
  await select(alice, text)
  await alice.keyboard.press('F2')
  await alice.keyboard.press('Control+A')
  await alice.keyboard.type('Заголовок схемы платежей')
  await alice.getByTestId('diagram-canvas').click({ position: { x: 20, y: 20 } })
  await expect.poll(async () => (await cells(alice)).find((cell) => cell.id === text)?.value).toBe('Заголовок схемы платежей')
  const width = (await cells(alice)).find((cell) => cell.id === text)!.width

  await select(alice, text)
  await alice.keyboard.press('Control+B')

  await expect.poll(async () => (await cells(alice)).find((cell) => cell.id === text)!.width).toBeGreaterThan(width)
  await close()
})
