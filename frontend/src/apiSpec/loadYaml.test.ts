import { afterEach, describe, expect, it, vi } from 'vitest'

describe('loading the YAML library', () => {
  afterEach(() => {
    vi.doUnmock('yaml')
    vi.resetModules()
  })

  it('tells that it could not load the library, and tries again with the next document', async () => {
    vi.doMock('yaml', () => {
      throw new Error('Failed to fetch dynamically imported module')
    })
    const { loadDocument } = await import('./loadDocument.ts')

    await expect(loadDocument({ name: 'api.yaml', text: 'openapi: 3.0.0' })).rejects.toThrow(
      'api.yaml: не удалось загрузить разбор YAML — проверьте подключение к сети',
    )
    vi.doUnmock('yaml')
    expect(await loadDocument({ name: 'api.yaml', text: 'openapi: 3.0.0' })).toEqual({ openapi: '3.0.0' })
  })
})
