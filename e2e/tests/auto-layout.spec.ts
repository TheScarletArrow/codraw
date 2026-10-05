import { expect, test, type Page } from '@playwright/test'
import { addShape, cellBox, center, connect, drag, twoParticipants, userPage, vertices, type CellInfo } from './helpers.ts'

/** Boxes of the shapes by id, in diagram coordinates. */
async function boxes(page: Page): Promise<Map<string, CellInfo>> {
  return new Map((await vertices(page)).map((cell) => [cell.id, cell]))
}

/** The shapes in the order of their left edges, or of their top edges. */
async function order(page: Page, ids: string[], axis: 'x' | 'y'): Promise<string[]> {
  const all = await boxes(page)
  return [...ids].sort((a, b) => all.get(a)![axis] - all.get(b)![axis])
}

async function layOut(page: Page, direction: 'Слева направо' | 'Сверху вниз') {
  await page.getByRole('button', { name: 'Автораскладка' }).click()
  await page.getByRole('dialog', { name: 'Автораскладка' }).getByRole('button', { name: new RegExp(direction) }).click()
}

test('auto layout puts a chain in layers for everybody, left to right and top to bottom, and is undone in one step', async ({
  browser,
}) => {
  const { alice, bob, close } = await twoParticipants(browser)
  // A chain «client» → «api» → «db», with «db» standing between the other two.
  const db = await addShape(alice, 'Прямоугольник')
  const client = await addShape(alice, 'Прямоугольник')
  const middle = center(await cellBox(alice, client))
  await drag(alice, middle, { x: middle.x - 250, y: middle.y + 120 })
  const api = await addShape(alice, 'Прямоугольник')
  await drag(alice, middle, { x: middle.x + 250, y: middle.y - 120 })
  await connect(alice, client, api)
  await connect(alice, api, db)
  await alice.mouse.click(5, 400)
  const before = await boxes(alice)
  const chain = [client, api, db]

  await layOut(alice, 'Слева направо')

  await expect.poll(() => order(alice, chain, 'x')).toEqual(chain)
  await expect.poll(() => order(bob, chain, 'x')).toEqual(chain)
  const laidOut = await boxes(alice)
  for (const [a, b] of [
    [client, api],
    [api, db],
  ] as const) {
    expect(laidOut.get(a)!.x + laidOut.get(a)!.width).toBeLessThan(laidOut.get(b)!.x)
  }

  await alice.keyboard.press('Control+z')
  await expect.poll(async () => (await boxes(bob)).get(api)!.x).toBe(before.get(api)!.x)

  await layOut(alice, 'Сверху вниз')
  await expect.poll(() => order(bob, chain, 'y')).toEqual(chain)

  await close()
})

test('Ctrl+Shift+L lays out the Kubernetes template with the pods inside the cluster', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  await alice.goto('/')
  await alice.getByRole('region', { name: 'Начать с шаблона' }).getByRole('button', { name: /Деплой в Kubernetes/ }).click()
  await expect(alice.getByRole('status')).toHaveText('Синхронизировано')
  await expect.poll(async () => (await vertices(alice)).length).toBeGreaterThan(5)
  const before = await vertices(alice)

  await alice.getByTestId('diagram-canvas').click({ position: { x: 5, y: 5 } })
  await alice.keyboard.press('Control+Shift+L')

  await expect.poll(async () => (await vertices(alice)).map((cell) => cell.x)).not.toEqual(before.map((cell) => cell.x))
  const after = await vertices(alice)
  const cluster = after.find((cell) => cell.style.codrawShape === 'kubernetes-cluster')!
  const holds = (cell: CellInfo) =>
    cell.x >= cluster.x &&
    cell.y >= cluster.y &&
    cell.x + cell.width <= cluster.x + cluster.width &&
    cell.y + cell.height <= cluster.y + cluster.height
  const byValue = (value: string) => after.find((cell) => cell.value === value)!
  for (const pod of ['frontend', 'backend', 'worker']) expect(holds(byValue(pod))).toBe(true)
  for (const outside of after.filter((cell) => cell.style.codrawShape === 'load-balancer' || cell.style.codrawShape === 'cdn')) {
    expect(holds(outside)).toBe(false)
  }

  await alice.context().close()
})
