import { describe, expect, it } from 'vitest'
import { ChunkLoadError, isChunkLoadError, lazyPage } from './lazyPage.ts'

function Page() {
  return null
}

describe('lazyPage', () => {
  it('gives the component of the loaded module to the route', async () => {
    const lazy = lazyPage(async () => ({ Page }), (module) => module.Page)

    expect(await lazy()).toEqual({ Component: Page })
  })

  it('turns a failed import into a ChunkLoadError that keeps the cause', async () => {
    const cause = new TypeError('Failed to fetch dynamically imported module')
    const lazy = lazyPage(() => Promise.reject(cause), () => Page)

    const error: unknown = await lazy().catch((error: unknown) => error)

    expect(error).toBeInstanceOf(ChunkLoadError)
    expect(isChunkLoadError(error)).toBe(true)
    expect((error as ChunkLoadError).cause).toBe(cause)
    expect((error as ChunkLoadError).message).toContain('Failed to fetch dynamically imported module')
  })

  it('tells a ChunkLoadError from other errors', () => {
    expect(isChunkLoadError(new Error('Сломалось'))).toBe(false)
    expect(isChunkLoadError(new ChunkLoadError('нет файла'))).toBe(true)
  })
})
