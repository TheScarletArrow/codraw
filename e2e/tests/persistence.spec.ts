import { expect, test } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { env } from './env.ts'
import { collabToken, connectToCollab, createBoardViaApi, signIn } from './helpers.ts'

// A separate collab instance that the test can kill and start again.
const port = 1235

async function startCollab(): Promise<ChildProcess> {
  const collab = spawn('node', ['../collab/dist/index.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      BACKEND_URL: env.backendUrl,
      BACKEND_JWKS_URL: env.jwksUrl,
      CODRAW_INTERNAL_TOKEN: env.internalToken,
    },
    stdio: 'inherit',
  })
  await expect
    .poll(() => fetch(`http://localhost:${port}/health`).then((r) => r.status, () => 0), { timeout: 10_000 })
    .toBe(200)
  return collab
}

test('the document survives a crash and restart of collab', async ({ request }) => {
  await signIn(request, 'Алиса')
  const boardId = await createBoardViaApi(request, 'Переживёт перезапуск')
  const connect = (boardId: string) => connectToCollab(`ws://localhost:${port}`, boardId, () => collabToken(request, boardId))

  let collab = await startCollab()
  try {
    const writer = await connect(boardId)
    writer.document.getMap('meta').set('title', 'Сохранено')

    // The participant stays connected: the change must be stored within 10 seconds anyway.
    await expect
      .poll(
        async () =>
          (await request.get(`${env.backendUrl}/internal/boards/${boardId}/document`, {
            headers: { 'X-Internal-Token': env.internalToken },
          })).status(),
        { timeout: 10_000 },
      )
      .toBe(200)
    writer.provider.destroy()

    collab.kill('SIGKILL')
    await once(collab, 'exit')
    collab = await startCollab()

    const reader = await connect(boardId)
    expect(reader.document.getMap('meta').get('title')).toBe('Сохранено')
    reader.provider.destroy()
  } finally {
    collab.kill('SIGKILL')
  }
})
