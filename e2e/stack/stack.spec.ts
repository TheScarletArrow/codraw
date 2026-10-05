import { expect, test, type Browser, type Page } from '@playwright/test'

/** A guest in a fresh browser context, whose page records what the Content Security Policy blocks. */
async function guest(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.addInitScript(() => {
    const violations: string[] = []
    Object.assign(window, { cspViolations: violations })
    document.addEventListener('securitypolicyviolation', (event) =>
      violations.push(`${event.effectiveDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber}`),
    )
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Продолжить без входа' }).click()
  await expect(page.getByRole('banner')).toContainText(/Гость \d+/)
  return page
}

/** What the Content Security Policy blocked on the page since it was loaded. */
const cspViolations = (page: Page) => page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations)

/** Shapes on the canvas, read through the editor that the app exposes on the canvas element. */
function shapeCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid=diagram-canvas]') as unknown as Record<string, any> | null
    const parent = container?.__codrawEditor?.graph.getDefaultParent()
    return parent ? parent.getChildCount() : 0
  })
}

test('two guests work on one board through the app address without violations of the Content Security Policy', async ({
  browser,
}) => {
  const owner = await guest(browser)
  await owner.getByRole('button', { name: 'Создать доску' }).click()
  await expect(owner.getByRole('status')).toHaveText('Синхронизировано')
  const link = new URL(owner.url())

  // A deep link opens the app, which opens the board.
  const other = await guest(browser)
  await other.goto(link.pathname + link.search)
  await expect(other.getByRole('status')).toHaveText('Синхронизировано')

  await owner.getByRole('complementary', { name: 'Фигуры' }).getByRole('button', { name: 'Прямоугольник', exact: true }).click()

  await expect.poll(() => shapeCount(other)).toBe(1)
  await expect(other.getByRole('list', { name: 'Участники' }).getByRole('listitem')).toHaveCount(2)
  await owner.getByRole('button', { name: 'Поделиться' }).click()
  await expect(owner.getByRole('textbox', { name: 'Ссылка на доску' })).toHaveValue(owner.url())
  expect(await cspViolations(owner)).toEqual([])
  expect(await cspViolations(other)).toEqual([])
})

test('the app comes with the security headers, and its files are cached for a year', async ({ request }) => {
  const page = await request.get('/boards/0199a000-0000-7000-8000-000000000001')
  expect(page.status()).toBe(200)
  expect(page.headers()['content-type']).toContain('text/html')
  expect(page.headers()['cache-control']).toBe('no-cache')
  const csp = page.headers()['content-security-policy']
  expect(csp).toContain("default-src 'self'")
  expect(csp).toContain("script-src 'self'")
  expect(csp).toContain("frame-ancestors 'none'")
  expect(page.headers()['x-content-type-options']).toBe('nosniff')
  expect(page.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin')

  const script = /src="(\/assets\/[^"]+\.js)"/.exec(await page.text())![1]!
  const asset = await request.get(script)
  expect(asset.status()).toBe(200)
  expect(asset.headers()['cache-control']).toBe('public, max-age=31536000, immutable')
})

test('the API answers through the app address, and the internal API of the backend does not', async ({ request }) => {
  expect((await request.get('/api/me')).status()).toBe(401)
  expect((await request.get('/internal/boards/0199a000-0000-7000-8000-000000000001/document')).status()).toBe(404)
  expect((await request.get('/actuator/health')).status()).toBe(404)
})

test('the metrics of backend and collab are not given through the app address', async ({ request }) => {
  expect((await request.get('/actuator/prometheus')).status()).toBe(404)
  expect((await request.get('/api/actuator/prometheus')).status()).not.toBe(200)
  // Any other path is a page of the app.
  const collab = await request.get('/metrics')
  expect(collab.headers()['content-type']).toContain('text/html')
  expect(await collab.text()).not.toContain('codraw_collab')
})

test('the OAuth callback URL is the app address, with its port', async ({ request, baseURL }) => {
  const response = await request.get('/api/oauth2/authorization/github', { maxRedirects: 0 })

  expect(response.status()).toBe(302)
  const location = new URL(response.headers()['location']!)
  expect(location.searchParams.get('redirect_uri')).toBe(`${baseURL}/api/login/oauth2/code/github`)
})
