import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, twoParticipants, vertices, type Box } from './helpers.ts'

/** Puts shapes at their boxes through the editor of the page in one change, as a participant would by dragging them. */
function arrange(page: Page, boxes: Record<string, Box>) {
  return page.evaluate((boxes) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const model = container.__codrawEditor.graph.getDataModel()
    model.beginUpdate()
    try {
      for (const [id, { x, y, width, height }] of Object.entries(boxes)) {
        const geometry = model.getCell(id).getGeometry().clone()
        Object.assign(geometry, { x, y, width, height })
        model.setGeometry(model.getCell(id), geometry)
      }
    } finally {
      model.endUpdate()
    }
  }, boxes)
}

const boxOf = async (page: Page, id: string): Promise<Box> => {
  const { x, y, width, height } = (await vertices(page)).find((cell) => cell.id === id)!
  return { x, y, width, height }
}

test('a table made with the arrow from a table of a boundary goes into it, and the service makes room for both', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const source = await addShape(alice, 'Таблица')
  const service = await addShape(alice, 'Сервис')
  const boundary = await addShape(alice, 'Граница')
  // The table close to the right side of the boundary, the service 40 to the right of it.
  const table = await boxOf(alice, source)
  const frame = { x: 180, y: 60, width: table.width + 40, height: table.height + 60 }
  const right = frame.x + frame.width
  await arrange(alice, {
    [source]: { ...table, x: 200, y: 100 },
    [boundary]: frame,
    [service]: { x: right + 40, y: 100, width: 120, height: 60 },
  })
  const box = await cellBox(alice, source)
  await alice.mouse.click(box.x + box.width / 2, box.y + 10)

  await alice.getByRole('button', { name: 'Добавить фигуру справа' }).click()
  await alice.getByRole('dialog', { name: 'Фигуры для связи' }).getByRole('button', { name: 'Таблица' }).click()

  await expect.poll(async () => (await vertices(alice)).length).toBe(4)
  const added = (await vertices(alice)).find((cell) => ![source, service, boundary].includes(cell.id))!
  // On the axis of the source: the service out of the boundary does not shift it down.
  expect(added).toMatchObject({ y: 100 })
  expect(added.x).toBeGreaterThan(200 + table.width)
  const grown = right + Math.ceil((added.x + added.width + 20 - right) / 10) * 10
  for (const page of [alice, bob]) {
    await expect.poll(() => boxOf(page, boundary)).toEqual({ ...frame, width: grown - frame.x })
    await expect.poll(() => boxOf(page, service)).toEqual({ x: grown + 40, y: 100, width: 120, height: 60 })
  }

  await alice.getByRole('button', { name: 'Отменить' }).click()

  await expect.poll(async () => (await vertices(bob)).length).toBe(3)
  await expect.poll(() => boxOf(bob, boundary)).toEqual(frame)
  await expect.poll(() => boxOf(bob, service)).toEqual({ x: right + 40, y: 100, width: 120, height: 60 })

  await close()
})
