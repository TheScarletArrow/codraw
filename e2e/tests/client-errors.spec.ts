import { expect, test } from '@playwright/test'
import { createBoard, userPage } from './helpers.ts'
import { env } from './env.ts'

/** The count of errors of browsers of a kind, from the metrics of the backend. */
async function clientErrors(kind: string): Promise<number> {
  const metrics = await (await fetch(`${env.backendUrl}/actuator/prometheus`)).text()
  const line = metrics.split('\n').find((candidate) => candidate.startsWith('codraw_client_errors_total') && candidate.includes(`kind="${kind}"`))
  return Number(line!.split(' ').at(-1))
}

test('an error on a board reaches the backend once, with the path of the page without its query', async ({ browser }) => {
  const alice = await userPage(browser, 'Алиса')
  const url = await createBoard(alice)
  await expect(alice).toHaveURL(/\?page=/)
  const reports: Record<string, unknown>[] = []
  alice.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/client-errors') reports.push(request.postDataJSON())
  })
  const before = await clientErrors('error')

  const response = alice.waitForResponse((candidate) => new URL(candidate.url()).pathname === '/api/client-errors')
  // The same error twice, thrown outside of any handler.
  await alice.evaluate(() => {
    for (let i = 0; i < 2; i++) {
      setTimeout(() => {
        throw new TypeError('Ошибка для проверки отчётов')
      })
    }
  })
  expect((await response).status()).toBe(204)

  await expect.poll(() => clientErrors('error')).toBe(before + 1)
  expect(reports).toEqual([
    expect.objectContaining({
      kind: 'error',
      message: 'TypeError: Ошибка для проверки отчётов',
      path: new URL(url).pathname,
      stack: expect.stringContaining('TypeError'),
    }),
  ])

  await alice.context().close()
})
