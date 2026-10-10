import { expect, test, type Page } from '@playwright/test'
import * as Y from 'yjs'
import { env } from './env.ts'
import { addShape, cellBox, createBoard, openBoard, twoParticipants, userPage, vertices } from './helpers.ts'

/** The labels of all cells of the document of the board that the backend stored, the cells of grid tables included. */
async function storedLabels(page: Page): Promise<string[]> {
  const boardId = new URL(page.url()).pathname.split('/').pop()
  const response = await fetch(`${env.backendUrl}/internal/boards/${boardId}/document`, {
    headers: { 'X-Internal-Token': env.internalToken },
  })
  if (response.status !== 200) return []
  const document = new Y.Doc()
  Y.applyUpdate(document, new Uint8Array(await response.arrayBuffer()))
  // Mirrors the model of the board document: the cells of a page are in the top-level map `cells:<page id>`.
  return Array.from(document.share.keys())
    .filter((name) => name.startsWith('cells:'))
    .flatMap((name) => Array.from(document.getMap<Y.Map<unknown>>(name).values()))
    .map((cell) => String(cell.get('value') ?? ''))
}

/** The texts of the cells of a grid table, row by row. */
function gridTexts(page: Page, id: string): Promise<string[]> {
  return page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const table = container.__codrawEditor.graph.getDataModel().getCell(id)
    return (table?.getChildren() ?? []).map((cell: any) => String(cell.getValue() ?? ''))
  }, id)
}

const valueOf = async (page: Page, id: string) => (await vertices(page)).find((cell) => cell.id === id)?.value
const labelEditor = (page: Page) => page.getByTestId('diagram-canvas').locator('[contenteditable="true"]')

/** Ends editing a label with a click on the empty bottom-left corner of the canvas. */
async function clickEmptyCanvas(page: Page) {
  const canvas = (await page.getByTestId('diagram-canvas').boundingBox())!
  await page.mouse.click(canvas.x + 20, canvas.y + canvas.height - 20)
}

/** Double-clicks the cell of a 4×3 grid table at a row and a column. */
async function editGridCell(page: Page, id: string, row: number, column: number) {
  const box = await cellBox(page, id)
  await page.mouse.dblclick(box.x + (column + 0.5) * box.width / 3, box.y + (row + 0.5) * box.height / 4)
}

/** Opens the label editor of a list with the caret after its last item. */
async function editAtEnd(page: Page, id: string) {
  const box = await cellBox(page, id)
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
  await expect(labelEditor(page)).toBeFocused()
  await page.keyboard.press('ControlOrMeta+End')
}

test('the cells of a grid table take text: the other participant sees it, it stays after reopening and Ctrl+Z undoes it', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const table = await addShape(alice, 'Сетка таблицы')
  await expect.poll(() => gridTexts(alice, table)).toEqual(['Таблица', ...Array(11).fill('')])

  await editGridCell(alice, table, 1, 1)
  await expect(labelEditor(alice)).toBeFocused()
  await alice.keyboard.type('Заказы')
  await clickEmptyCanvas(alice)
  await editGridCell(alice, table, 3, 2)
  await alice.keyboard.type('Итого')
  await clickEmptyCanvas(alice)

  const filled = ['Таблица', '', '', '', 'Заказы', '', '', '', '', '', '', 'Итого']
  await expect.poll(() => gridTexts(bob, table)).toEqual(filled)

  // The text of a filled cell changes as well.
  await editGridCell(bob, table, 1, 1)
  await expect(labelEditor(bob)).toBeFocused()
  await bob.keyboard.press('ControlOrMeta+A')
  await bob.keyboard.type('Платежи')
  await clickEmptyCanvas(bob)
  await expect.poll(() => gridTexts(alice, table)).toEqual(filled.with(4, 'Платежи'))

  // The text of the cells is stored by the backend, not only kept by the participants.
  await expect.poll(() => storedLabels(alice), { timeout: 15_000 }).toEqual(expect.arrayContaining(['Платежи', 'Итого']))
  await alice.reload()
  await expect(alice.getByRole('status')).toHaveText('Синхронизировано')
  await expect.poll(() => gridTexts(alice, table)).toEqual(filled.with(4, 'Платежи'))

  await bob.keyboard.press('ControlOrMeta+Z')
  await expect.poll(() => gridTexts(alice, table)).toEqual(filled)
  await bob.keyboard.press('ControlOrMeta+Shift+Z')
  await expect.poll(() => gridTexts(alice, table)).toEqual(filled.with(4, 'Платежи'))

  await close()
})

test('Enter continues a bulleted and a numbered list, Enter on an empty item leaves it, and the lists stay after reopening', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const bullets = await addShape(alice, 'Список')
  await editAtEnd(alice, bullets)
  // Ctrl+Z during the editing takes the new marker back and leaves the caret where it was, the text kept.
  await alice.keyboard.press('Enter')
  await alice.keyboard.press('ControlOrMeta+Z')
  await expect(labelEditor(alice)).toHaveText('• Элемент• Элемент• Элемент')
  await alice.keyboard.press('Enter')
  await alice.keyboard.type('Четвёртый')
  await alice.keyboard.press('Enter')
  await alice.keyboard.press('Enter')
  await alice.keyboard.type('Вывод')
  await clickEmptyCanvas(alice)
  await expect.poll(() => valueOf(bob, bullets)).toBe('• Элемент\n• Элемент\n• Элемент\n• Четвёртый\nВывод')

  const numbers = await addShape(alice, 'Нумерованный список')
  await editAtEnd(alice, numbers)
  await alice.keyboard.press('Enter')
  await alice.keyboard.type('Четвёртый')
  await alice.keyboard.press('Enter')
  await alice.keyboard.type('Пятый')
  await clickEmptyCanvas(alice)
  const numbered = '1. Элемент\n2. Элемент\n3. Элемент\n4. Четвёртый\n5. Пятый'
  await expect.poll(() => valueOf(bob, numbers)).toBe(numbered)
  expect((await vertices(bob)).find((cell) => cell.id === numbers)?.style.codrawShape).toBe('numbered-list')

  // Ctrl+Z takes back the whole edit of the label.
  await alice.keyboard.press('ControlOrMeta+Z')
  await expect.poll(() => valueOf(bob, numbers)).toBe('1. Элемент\n2. Элемент\n3. Элемент')
  await alice.keyboard.press('ControlOrMeta+Shift+Z')
  await expect.poll(() => valueOf(bob, numbers)).toBe(numbered)

  await expect
    .poll(() => storedLabels(bob), { timeout: 15_000 })
    .toEqual(expect.arrayContaining([numbered, '• Элемент\n• Элемент\n• Элемент\n• Четвёртый\nВывод']))
  await bob.reload()
  await expect(bob.getByRole('status')).toHaveText('Синхронизировано')
  await expect.poll(() => valueOf(bob, numbers)).toBe(numbered)
  expect(await valueOf(bob, bullets)).toBe('• Элемент\n• Элемент\n• Элемент\n• Четвёртый\nВывод')

  await close()
})

test('the toolbar changes the kind of the selected list and «Отменить» changes it back', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const shapes = alice.getByRole('complementary', { name: 'Фигуры' })
  await expect(shapes.getByRole('button', { name: 'Список', exact: true }).locator('svg.lucide-list')).toBeVisible()
  await expect(shapes.getByRole('button', { name: 'Нумерованный список', exact: true }).locator('svg.lucide-list-ordered')).toBeVisible()
  const list = await addShape(alice, 'Список')

  const bulleted = alice.getByRole('button', { name: 'Маркированный список' })
  const numbered = alice.getByRole('button', { name: 'Нумерованный список' }).and(alice.locator('[aria-pressed]'))
  await expect(bulleted).toHaveAttribute('aria-pressed', 'true')
  await numbered.click()
  await expect(numbered).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => valueOf(bob, list)).toBe('1. Элемент\n2. Элемент\n3. Элемент')
  expect((await vertices(bob)).find((cell) => cell.id === list)?.style.codrawShape).toBe('numbered-list')

  await alice.getByRole('button', { name: 'Отменить' }).click()
  await expect.poll(() => valueOf(bob, list)).toBe('• Элемент\n• Элемент\n• Элемент')
  await expect(bulleted).toHaveAttribute('aria-pressed', 'true')

  await close()
})

test('a participant with viewing access opens neither a cell of a grid table nor a list for editing', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await createBoard(alice)
  const table = await addShape(alice, 'Сетка таблицы')
  const list = await addShape(alice, 'Список')
  await alice.getByRole('button', { name: 'Поделиться' }).click()
  const changed = alice.waitForResponse((response) => response.request().method() === 'PATCH' && response.ok())
  await alice.getByRole('radio', { name: /Просмотр/ }).check()
  await changed
  await alice.keyboard.press('Escape')

  await openBoard(bob, url)
  await expect(bob.getByText('Только просмотр')).toBeVisible()
  await expect.poll(() => gridTexts(bob, table)).toHaveLength(12)
  await editGridCell(bob, table, 1, 1)
  await bob.keyboard.type('Чужое')
  const box = await cellBox(bob, list)
  await bob.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
  await bob.keyboard.press('Enter')
  await expect(labelEditor(bob)).toHaveCount(0)
  await expect(bob.getByRole('button', { name: 'Маркированный список' })).toHaveCount(0)
  expect(await gridTexts(alice, table)).toEqual(['Таблица', ...Array(11).fill('')])
  expect(await valueOf(alice, list)).toBe('• Элемент\n• Элемент\n• Элемент')

  await Promise.all([alice.context().close(), bob.context().close()])
})
