import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockFetch } from '../test/render.tsx'
import { currentBuild, fetchDeployedBuild, isOtherBuild, VERSION_URL } from './version.ts'

describe('fetchDeployedBuild', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('answers the build that the server gives, asking past the cache of the browser', async () => {
    const fetchMock = mockFetch({ 'GET /version.json': { body: { version: '0.41.0', build: 'abc', extra: true } } })

    expect(await fetchDeployedBuild()).toEqual({ version: '0.41.0', build: 'abc' })
    expect(fetchMock).toHaveBeenCalledWith(VERSION_URL, expect.objectContaining({ cache: 'no-store' }))
  })

  it('answers nothing when the server answers with an error', async () => {
    mockFetch({ 'GET /version.json': { status: 404, body: { version: '0.41.0', build: 'abc' } } })

    expect(await fetchDeployedBuild()).toBeNull()
  })

  it('answers nothing when the server answers with the page of the app instead of the file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<!doctype html><html></html>', { headers: { 'Content-Type': 'text/html' } })),
    )

    expect(await fetchDeployedBuild()).toBeNull()
  })

  it.each([
    ['null', null],
    ['a list', ['0.41.0', 'abc']],
    ['no build', { version: '0.41.0' }],
    ['an empty build', { version: '0.41.0', build: '' }],
    ['a build that is not a string', { version: '0.41.0', build: 42 }],
    ['no version', { build: 'abc' }],
  ])('answers nothing for a file of another shape: %s', async (_, body) => {
    mockFetch({ 'GET /version.json': { body } })

    expect(await fetchDeployedBuild()).toBeNull()
  })

  it('answers nothing without a connection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))

    expect(await fetchDeployedBuild()).toBeNull()
  })
})

describe('isOtherBuild', () => {
  it('tells another build of the server from the build of the tab', () => {
    expect(isOtherBuild({ version: currentBuild.version, build: `${currentBuild.build}-next` })).toBe(true)
    expect(isOtherBuild({ version: '99.0.0', build: currentBuild.build })).toBe(false)
    expect(isOtherBuild(null)).toBe(false)
  })

  it('knows the build of the tab', () => {
    expect(currentBuild.build).not.toBe('')
    expect(currentBuild.version).toMatch(/^\d+\.\d+\.\d+/)
  })
})
