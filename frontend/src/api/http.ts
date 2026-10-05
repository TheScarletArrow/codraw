/** The body of an error response: the API answers with problem details (RFC 9457). */
export interface Problem {
  title?: string
  detail?: string
  /** The limit that the request ran into, e.g. the most boards a user owns. */
  limit?: number
}

export class HttpError extends Error {
  readonly status: number
  readonly problem: Problem | undefined

  constructor(status: number, problem?: Problem) {
    super(`Request failed with status ${status}`)
    this.name = 'HttpError'
    this.status = status
    this.problem = problem
  }
}

export const isNotFound = (error: unknown) => error instanceof HttpError && error.status === 404

export const isUnauthorized = (error: unknown) => error instanceof HttpError && error.status === 401

/** The board is there, but its owner closed its link to others. */
export const isForbidden = (error: unknown) => error instanceof HttpError && error.status === 403

/** The request ran into a limit of the rate of such requests, e.g. of new guests from one address. */
export const isTooManyRequests = (error: unknown) => error instanceof HttpError && error.status === 429

/** The backend puts the CSRF token into this cookie and expects it back in the header on every change. */
const CSRF_COOKIE = 'XSRF-TOKEN'
const CSRF_HEADER = 'X-XSRF-TOKEN'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function csrfToken(): string | undefined {
  const cookie = document.cookie.split('; ').find((entry) => entry.startsWith(`${CSRF_COOKIE}=`))
  return cookie && decodeURIComponent(cookie.slice(CSRF_COOKIE.length + 1))
}

/** Any API response carries the CSRF cookie; without one yet (e.g. right after logout), ask the API for it. */
async function ensureCsrfToken(): Promise<string | undefined> {
  if (!csrfToken()) await fetch('/api/me', { headers: { Accept: 'application/json' } })
  return csrfToken()
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await send(path, init, 'application/json')
  return (response.status === 204 ? undefined : await response.json()) as T
}

/** Like {@link request}, for a binary response. */
export async function requestBytes(path: string, init: RequestInit = {}): Promise<Uint8Array> {
  const response = await send(path, init, 'application/octet-stream')
  return new Uint8Array(await response.arrayBuffer())
}

async function send(path: string, init: RequestInit, accept: string): Promise<Response> {
  const token = SAFE_METHODS.has(init.method ?? 'GET') ? undefined : await ensureCsrfToken()
  const response = await fetch(path, {
    ...init,
    headers: { Accept: accept, ...(token && { [CSRF_HEADER]: token }), ...init.headers },
  })
  if (!response.ok) {
    throw new HttpError(response.status, await problemOf(response))
  }
  return response
}

async function problemOf(response: Response): Promise<Problem | undefined> {
  if (!response.headers.get('Content-Type')?.includes('json')) return undefined
  try {
    return (await response.json()) as Problem
  } catch {
    return undefined
  }
}
