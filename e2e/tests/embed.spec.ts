import { expect, request, test, type Page } from '@playwright/test'
import { env } from './env.ts'
import { addShape, cellBox, center, twoParticipants } from './helpers.ts'

/** Turns the live image of the current page on in «Поделиться» and returns its address. */
async function turnOn(owner: Page): Promise<string> {
  await owner.getByRole('button', { name: 'Поделиться' }).click()
  const section = owner.getByRole('region', { name: 'Живая картинка' })
  await section.getByRole('checkbox', { name: 'Живая картинка' }).check()
  const link = section.getByRole('textbox', { name: 'Ссылка на картинку' })
  await expect(link).toHaveValue(/\/api\/embeds\/[A-Za-z0-9_-]{22}\.svg$/)
  return link.inputValue()
}

/** The image as a reader of a document gets it: without a session. */
async function fetchImage(url: string) {
  const anonymous = await request.newContext()
  try {
    const response = await anonymous.get(url)
    return { status: response.status(), headers: response.headers(), body: await response.text() }
  } finally {
    await anonymous.dispose()
  }
}

test('the live image of a page is served without a sign-in and follows the changes of the participants', async ({ browser }) => {
  const { alice, bob, close } = await twoParticipants(browser)
  const shape = await addShape(alice, 'Прямоугольник')
  const box = await cellBox(alice, shape)
  await alice.mouse.dblclick(center(box).x, center(box).y)
  await expect(alice.locator('[data-testid=diagram-canvas] [contenteditable="true"]')).toBeFocused()
  await alice.keyboard.type('Заказы')
  await alice.mouse.click(5, 400)

  const url = await turnOn(alice)
  expect(url.startsWith(env.frontendUrl)).toBe(true)

  // Published at once when turned on.
  await expect.poll(async () => (await fetchImage(url)).body, { timeout: 15_000 }).toContain('Заказы')
  const image = await fetchImage(url)
  expect(image.headers['content-type']).toContain('image/svg+xml')
  expect(image.headers['content-security-policy']).toContain('sandbox')
  expect(image.headers['cache-control']).toContain('max-age=60')

  // Bob, who edits through the link, renames the shape: his browser publishes the new picture.
  await expect(bob.getByRole('button', { name: 'Поделиться' })).toBeVisible()
  const bobBox = await cellBox(bob, shape)
  await bob.mouse.dblclick(center(bobBox).x, center(bobBox).y)
  await expect(bob.locator('[data-testid=diagram-canvas] [contenteditable="true"]')).toBeFocused()
  await bob.keyboard.press('ControlOrMeta+a')
  await bob.keyboard.type('Платежи')
  await bob.mouse.click(5, 400)
  await expect.poll(async () => (await fetchImage(url)).body, { timeout: 30_000 }).toContain('Платежи')

  // Bob sees the address too, but cannot turn the image off.
  await bob.getByRole('button', { name: 'Поделиться' }).click()
  await expect(bob.getByRole('textbox', { name: 'Ссылка на картинку' })).toHaveValue(url)
  await expect(bob.getByRole('checkbox', { name: 'Живая картинка' })).toHaveCount(0)

  await alice.getByRole('checkbox', { name: 'Живая картинка' }).uncheck()
  await expect.poll(async () => (await fetchImage(url)).status).toBe(404)

  await close()
})
