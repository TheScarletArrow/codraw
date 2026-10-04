import { HocuspocusProvider } from '@hocuspocus/provider'
import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import * as Y from 'yjs'

/** Signs in as the test user with this name through the test login of the backend `e2e` profile. */
export async function signIn(request: APIRequestContext, name: string) {
  const response = await request.post('/api/e2e/login', { data: { name } })
  expect(response.status()).toBe(204)
}

/** A page in a fresh browser context signed in as the test user with this name. */
export async function userPage(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext()
  await signIn(context.request, name)
  return context.newPage()
}

/** Headers that let a signed-in API client change data: the CSRF token from the XSRF-TOKEN cookie. */
export async function csrfHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  await request.get('/api/me')
  const { cookies } = await request.storageState()
  return { 'X-XSRF-TOKEN': cookies.find((cookie) => cookie.name === 'XSRF-TOKEN')!.value }
}

/** Creates a board through the API as the signed-in user and returns its id. */
export async function createBoardViaApi(request: APIRequestContext, title: string): Promise<string> {
  const response = await request.post('/api/boards', { data: { title }, headers: await csrfHeaders(request) })
  expect(response.status()).toBe(201)
  return ((await response.json()) as { id: string }).id
}

/** Requests a collab token for the board as the signed-in user. */
export async function collabToken(request: APIRequestContext, boardId: string): Promise<string> {
  const response = await request.post(`/api/boards/${boardId}/collab-token`, { headers: await csrfHeaders(request) })
  expect(response.status()).toBe(200)
  return ((await response.json()) as { token: string }).token
}

/** Connects to the document of a board in collab directly, as the app does; rejects with the reason of a refusal. */
export function connectToCollab(url: string, boardId: string, token: string | (() => Promise<string>)) {
  const document = new Y.Doc()
  return new Promise<{ document: Y.Doc; provider: HocuspocusProvider }>((resolve, reject) => {
    const provider: HocuspocusProvider = new HocuspocusProvider({
      url,
      name: boardId,
      document,
      token,
      onSynced: () => resolve({ document, provider }),
      onAuthenticationFailed: ({ reason }) => {
        provider.destroy()
        reject(new Error(reason))
      },
    })
  })
}

/** Creates a board from the home page, waits until its document is synced and returns its address without the page. */
export async function createBoard(page: Page): Promise<string> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Создать доску' }).click()
  await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}(\?page=[^&]+)?$/)
  await expect(page.getByRole('status')).toHaveText('Синхронизировано')
  const url = new URL(page.url())
  url.search = ''
  return url.toString()
}

/** Opens a board and waits until it is synced. */
export async function openBoard(page: Page, url: string) {
  await page.goto(url)
  await expect(page.getByRole('status')).toHaveText('Синхронизировано')
}

/** Two users on one fresh board of the first one, opened by the second through its link. */
export async function twoParticipants(browser: Browser) {
  const alice = await userPage(browser, 'Алиса')
  const bob = await userPage(browser, 'Боб')
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

/**
 * Routes the page's sync connection through the test so that it can be held: while paused, messages
 * in both directions are queued, as if the network were slow. Resuming delivers them in order.
 */
export async function controllableSync(page: Page) {
  let paused = false
  const toServer: (string | Buffer)[] = []
  const toPage: (string | Buffer)[] = []
  const flushers: (() => void)[] = []
  await page.routeWebSocket(/\/collab/, (ws) => {
    const server = ws.connectToServer()
    ws.onMessage((message) => (paused ? toServer.push(message) : server.send(message)))
    server.onMessage((message) => (paused ? toPage.push(message) : ws.send(message)))
    flushers.push(() => {
      toServer.splice(0).forEach((message) => server.send(message))
      toPage.splice(0).forEach((message) => ws.send(message))
    })
  })
  return {
    pause() {
      paused = true
    },
    resume() {
      paused = false
      flushers.forEach((flush) => flush())
    },
  }
}
