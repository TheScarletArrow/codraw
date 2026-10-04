import { expect, test, type Page } from '@playwright/test'
import {
  addShape,
  cellBox,
  cells,
  center,
  connect,
  createBoard,
  drag,
  edges,
  controllableSync,
  openBoard,
  userPage,
  vertices,
} from './helpers.ts'

function setFillColor(page: Page, id: string, color: string) {
  return page.evaluate(
    ([id, color]) => {
      const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
      const { graph } = container.__codrawEditor
      graph.setCellStyles('fillColor', color, [graph.getDataModel().getCell(id)])
    },
    [id, color] as const,
  )
}

test('a shape, an edge and a label made by one participant appear for the other', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const url = await createBoard(alice)
  await openBoard(bob, url)

  const first = await addShape(alice, 'Прямоугольник')
  const second = await addShape(alice, 'Эллипс')
  const secondBox = await cellBox(alice, second)
  await drag(alice, { x: secondBox.x + 15, y: secondBox.y + 15 }, { x: secondBox.x + 215, y: secondBox.y + 15 })
  await connect(alice, first, second)
  await alice.mouse.dblclick(...(Object.values(center(await cellBox(alice, first))) as [number, number]))
  await alice.keyboard.type('Клиент')
  await alice.mouse.click(5, 400)

  await expect.poll(async () => (await vertices(bob)).map((cell) => cell.id).sort()).toEqual([first, second].sort())
  await expect.poll(async () => (await vertices(bob)).find((cell) => cell.id === first)?.value).toBe('Клиент')
  await expect.poll(async () => (await edges(bob)).map(({ source, target }) => ({ source, target }))).toEqual([
    { source: first, target: second },
  ])

  await Promise.all([alice.context().close(), bob.context().close()])
})

test('concurrent changes of the colour and the position of one shape are merged', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
  const bobSync = await controllableSync(bob)
  const url = await createBoard(alice)
  await openBoard(bob, url)
  const shape = await addShape(alice, 'Прямоугольник')
  await expect.poll(async () => (await vertices(bob)).length).toBe(1)
  const original = (await vertices(bob))[0]!

  // Neither participant sees the other's change before making their own.
  bobSync.pause()
  const box = await cellBox(bob, shape)
  await drag(bob, { x: box.x + 15, y: box.y + 15 }, { x: box.x + 115, y: box.y + 15 })
  await setFillColor(alice, shape, '#f8cecc')
  expect((await vertices(bob))[0]!.style.fillColor).toBeUndefined()
  expect((await vertices(alice))[0]!.x).toBe(original.x)
  bobSync.resume()

  for (const page of [alice, bob]) {
    await expect.poll(async () => (await cells(page))[0]).toMatchObject({ x: original.x + 100, style: { fillColor: '#f8cecc' } })
  }

  await Promise.all([alice.context().close(), bob.context().close()])
})
