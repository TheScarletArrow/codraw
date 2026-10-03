import { expect, type Browser, type Page } from '@playwright/test'

/** Creates a board from the home page and waits until its document is synced. */
export async function createBoard(page: Page): Promise<string> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Создать доску' }).click()
  await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('status')).toHaveText('Синхронизировано')
  return page.url()
}

/** Opens a board and waits until it is synced. */
export async function openBoard(page: Page, url: string) {
  await page.goto(url)
  await expect(page.getByRole('status')).toHaveText('Синхронизировано')
}

/** Two participants on one fresh board, each in an own browser context. */
export async function twoParticipants(browser: Browser) {
  const alice = await (await browser.newContext()).newPage()
  const bob = await (await browser.newContext()).newPage()
  const url = await createBoard(alice)
  await openBoard(bob, url)
  return { alice, bob, close: () => Promise.all([alice.context().close(), bob.context().close()]) }
}

export interface CellInfo {
  id: string
  kind: 'vertex' | 'edge'
  value: string
  x: number
  y: number
  width: number
  height: number
  style: Record<string, unknown>
  source: string | null
  target: string | null
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Reads the cells of the canvas through the editor the app exposes on the canvas element. */
export function cells(page: Page): Promise<CellInfo[]> {
  return page.evaluate(() => {
    // Mirrors EDITOR_PROPERTY in frontend/src/diagram/editor.ts.
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any> | null
    const editor = container?.__codrawEditor
    if (!editor) return []
    const parent = editor.graph.getDefaultParent()
    return Array.from({ length: parent.getChildCount() }, (_, index) => {
      const cell = parent.getChildAt(index)
      const geometry = cell.getGeometry()
      return {
        id: cell.getId(),
        kind: cell.isEdge() ? 'edge' : 'vertex',
        value: String(cell.getValue() ?? ''),
        x: geometry?.x ?? 0,
        y: geometry?.y ?? 0,
        width: geometry?.width ?? 0,
        height: geometry?.height ?? 0,
        style: { ...cell.getStyle() },
        source: cell.getTerminal(true)?.getId() ?? null,
        target: cell.getTerminal(false)?.getId() ?? null,
      }
    })
  })
}

export async function vertices(page: Page) {
  return (await cells(page)).filter((cell) => cell.kind === 'vertex')
}

export async function edges(page: Page) {
  return (await cells(page)).filter((cell) => cell.kind === 'edge')
}

/** Position of a cell on the screen, in page coordinates. */
export function cellBox(page: Page, id: string): Promise<Box> {
  return page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as HTMLElement & Record<string, any>
    const { graph } = container.__codrawEditor
    const state = graph.getView().getState(graph.getDataModel().getCell(id))
    const rect = container.getBoundingClientRect()
    return {
      x: rect.left - container.scrollLeft + state.x,
      y: rect.top - container.scrollTop + state.y,
      width: state.width,
      height: state.height,
    }
  }, id)
}

/** Absolute points of a rendered edge, in diagram view coordinates. */
export function edgePoints(page: Page, id: string): Promise<{ x: number; y: number }[]> {
  return page.evaluate((id) => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any>
    const { graph } = container.__codrawEditor
    const state = graph.getView().getState(graph.getDataModel().getCell(id))
    return (state?.absolutePoints ?? []).map((p: { x: number; y: number }) => ({ x: p.x, y: p.y }))
  }, id)
}

export const center = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })

/** Drags with the mouse in small steps, as maxGraph handlers expect. */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 })
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
}

/** Adds a shape from the palette with a click and returns its id. */
export async function addShape(page: Page, name: string): Promise<string> {
  const before = new Set((await vertices(page)).map((cell) => cell.id))
  await page.getByRole('complementary', { name: 'Фигуры' }).getByRole('button', { name, exact: true }).click()
  await expect.poll(async () => (await vertices(page)).length).toBe(before.size + 1)
  return (await vertices(page)).find((cell) => !before.has(cell.id))!.id
}

/** Drags from the connection point next to the right border of `source` to the centre of `target`. */
export async function connect(page: Page, source: string, target: string) {
  const from = await cellBox(page, source)
  const to = await cellBox(page, target)
  // The 16 px connection point starts at the right border; hovering the shape shows it.
  const point = { x: from.x + from.width + 8, y: from.y + from.height / 2 }
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.move(from.x + from.width - 2, point.y, { steps: 3 })
  await drag(page, point, center(to))
}
