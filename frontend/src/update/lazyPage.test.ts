import { describe, expect, it } from 'vitest'
import { setReportSender, type ErrorReport } from '../errors/reporting.ts'
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

  it('reports the failed import, which may be a module that breaks while it runs', async () => {
    const reports: ErrorReport[] = []
    setReportSender((report) => reports.push(report))
    const lazy = lazyPage(() => Promise.reject(new SyntaxError('Unexpected token')), () => Page)

    await lazy().catch(() => {})

    expect(reports).toEqual([expect.objectContaining({ kind: 'error', message: 'SyntaxError: Unexpected token' })])
  })

  it('tells a ChunkLoadError from other errors', () => {
    expect(isChunkLoadError(new Error('Сломалось'))).toBe(false)
    expect(isChunkLoadError(new ChunkLoadError('нет файла'))).toBe(true)
  })
})
