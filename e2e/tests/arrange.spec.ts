import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, cells, center, connect, drag, twoParticipants, vertices } from './helpers.ts'

/** Places shapes through the editor of the page, as a participant would by dragging them. */
function place(page: Page, positions: Record<string, { x: number; y: number }>) {
  return page.evaluate((positions) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const model = container.__codrawEditor.graph.getDataModel()
    model.beginUpdate()
    try {
      for (const [id, { x, y }] of Object.entries(positions)) {
        const geometry = model.getCell(id).getGeometry().clone()
        geometry.x = x
        geometry.y = y
        model.setGeometry(model.getCell(id), geometry)
      }
    } finally {
      model.endUpdate()
    }
  }, positions)
}

/** Groups on the page with the ids of what they hold. */
function groups(page: Page): Promise<{ id: string; children: string[] }[]> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const parent = container.__codrawEditor.graph.getDefaultParent()
    return parent
      .getChildren()
      .filter((cell: any) => cell.isVertex() && cell.getChildCount() > 0)
      .map((cell: any) => ({ id: cell.getId(), children: cell.getChildren().map((child: any) => child.getId()) }))
  })
}

const selectAll = async (page: Page) => {
  await page.getByTestId('diagram-canvas').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Control+A')
}

test('aligned and distributed shapes reach the other participant', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const ids = [await addShape(alice, 'Прямоугольник'), await addShape(alice, 'Прямоугольник'), await addShape(alice, 'Прямоугольник')]
  await place(alice, { [ids[0]!]: { x: 100, y: 100 }, [ids[1]!]: { x: 160, y: 400 }, [ids[2]!]: { x: 240, y: 180 } })
  await selectAll(alice)

  await alice.getByRole('button', { name: 'Выравнивание' }).click()
  const panel = alice.getByRole('dialog', { name: 'Выравнивание' })
  await panel.getByRole('button', { name: 'Выровнять по левому краю' }).click()
  await panel.getByRole('button', { name: 'Распределить по вертикали' }).click()

  // From 100 to 460: three shapes of 60 and two gaps of 90.
  await expect
    .poll(async () => (await vertices(bob)).map(({ id, x, y }) => ({ id, x, y })).sort((a, b) => a.y - b.y))
    .toEqual([
      { id: ids[0], x: 100, y: 100 },
      { id: ids[2], x: 100, y: 250 },
      { id: ids[1], x: 100, y: 400 },
    ])
  await close()
})

test('a group moves and is copied as a whole, and ungroups in place', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const client = await addShape(alice, 'Прямоугольник')
  const server = await addShape(alice, 'Эллипс')
  await place(alice, { [client]: { x: 100, y: 100 }, [server]: { x: 400, y: 100 } })
  await connect(alice, client, server)
  await expect.poll(async () => (await cells(alice)).filter((cell) => cell.kind === 'edge').length).toBe(1)
  await selectAll(alice)

  await alice.keyboard.press('Control+G')

  await expect.poll(async () => (await groups(bob)).map((group) => group.children.length)).toEqual([3])
  const [group] = await groups(alice)

  // Dragging a shape of the group moves the whole group.
  const box = await cellBox(alice, group!.id)
  await drag(alice, { x: box.x + 30, y: box.y + 30 }, { x: box.x + 30, y: box.y + 230 })
  await expect.poll(async () => (await vertices(bob)).find((cell) => cell.id === group!.id)?.y).toBe(300)

  await alice.keyboard.press('Control+C')
  await alice.keyboard.press('Control+V')
  await expect.poll(async () => (await groups(bob)).map((copy) => copy.children.length)).toEqual([3, 3])

  // The copy is selected after pasting; Ctrl+Shift+G puts its shapes back on the page.
  await alice.keyboard.press('Control+Shift+G')
  await expect.poll(async () => (await groups(bob)).length).toBe(1)
  await expect.poll(async () => (await vertices(bob)).length).toBe(3)
  await close()
})

test('«Показать всё» brings a far away shape into view', async ({ browser }) => {
  const { alice, close } = await twoParticipants(browser)
  const near = await addShape(alice, 'Прямоугольник')
  const far = await addShape(alice, 'Прямоугольник')
  await place(alice, { [near]: { x: 40, y: 40 }, [far]: { x: 3000, y: 2200 } })
  const canvas = (await alice.getByTestId('diagram-canvas').boundingBox())!
  const inView = async (id: string) => {
    const point = center(await cellBox(alice, id))
    return point.x > canvas.x && point.x < canvas.x + canvas.width && point.y > canvas.y && point.y < canvas.y + canvas.height
  }
  expect(await inView(far)).toBe(false)

  await alice.getByRole('button', { name: 'Показать всё' }).click()

  await expect.poll(() => inView(far)).toBe(true)
  expect(await inView(near)).toBe(true)
  expect(Number((await alice.getByRole('button', { name: 'Масштаб' }).textContent())!.replace('%', ''))).toBeLessThan(100)
  await close()
})
