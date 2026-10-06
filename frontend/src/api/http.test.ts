import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockFetch } from '../test/render.tsx'
import { HttpError, request } from './http.ts'

describe('request', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=token%2B1; path=/'
  })

  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; path=/; max-age=0'
    vi.unstubAllGlobals()
  })

  const sentHeaders = (fetchMock: ReturnType<typeof mockFetch>) => fetchMock.mock.calls[0]![1]!.headers

  it('sends the CSRF token from the XSRF-TOKEN cookie with changes', async () => {
    const fetchMock = mockFetch({ 'POST /api/boards': { status: 201, body: {} } })

    await request('/api/boards', { method: 'POST' })

    expect(sentHeaders(fetchMock)).toMatchObject({ 'X-XSRF-TOKEN': 'token+1' })
  })

  it('sends a change at once when the CSRF token is there, so that a closing page can send it', async () => {
    const fetchMock = mockFetch({ 'DELETE /api/boards/1/visit': { status: 204 } })

    const sent = request('/api/boards/1/visit', { method: 'DELETE', keepalive: true })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ keepalive: true, headers: { 'X-XSRF-TOKEN': 'token+1' } })
    await sent
  })

  it('does not send the CSRF token with reads', async () => {
    const fetchMock = mockFetch({ 'GET /api/boards': { body: [] } })

    await request('/api/boards')

    expect(sentHeaders(fetchMock)).not.toHaveProperty('X-XSRF-TOKEN')
  })

  it('gets the CSRF cookie from the API first when there is none yet', async () => {
    document.cookie = 'XSRF-TOKEN=; path=/; max-age=0'
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (input.toString() === '/api/me') document.cookie = 'XSRF-TOKEN=fresh; path=/'
      return new Response(null, { status: input.toString() === '/api/me' ? 401 : 204 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await request('/api/guest', { method: 'POST' })

    expect(fetchMock.mock.calls.map(([input]) => input.toString())).toEqual(['/api/me', '/api/guest'])
    expect(fetchMock.mock.calls[1]![1]!.headers).toMatchObject({ 'X-XSRF-TOKEN': 'fresh' })
  })

  it('returns nothing for 204 No Content', async () => {
    mockFetch({ 'POST /api/logout': { status: 204 } })

    await expect(request('/api/logout', { method: 'POST' })).resolves.toBeUndefined()
  })

  it('fails with the status of an unsuccessful response', async () => {
    mockFetch({ 'GET /api/me': { status: 401 } })

    await expect(request('/api/me')).rejects.toEqual(new HttpError(401))
  })

  it('keeps the problem details of an unsuccessful response', async () => {
    const problem = { title: 'Board limit reached', limit: 100 }
    mockFetch({ 'POST /api/boards': { status: 409, body: problem } })

    const error = await request('/api/boards', { method: 'POST' }).catch((error: unknown) => error)

    expect(error).toBeInstanceOf(HttpError)
    expect((error as HttpError).problem).toEqual(problem)
  })
})
