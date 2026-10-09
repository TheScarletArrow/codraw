/** The body of an error response: the API answers with problem details (RFC 9457). */
export interface Problem {
  title?: string
  detail?: string
  /** The limit that the request ran into, e.g. the most boards a user owns. */
  limit?: number
  /** The role on the board that the user has already, when they ask for what they have. */
  role?: string
  /** Whose things reached the limit, e.g. the open proposals of the board or of the author on it. */
  scope?: string
  /** How much of the limit is taken, e.g. the bytes of the images of a board. */
  used?: number
  /** Why an import of the schema of a database failed, e.g. `authentication-failed`. */
  reason?: string
  /** The number of a decision that the board has already. */
  number?: number
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

/** The header with the CSRF token that a change needs, for requests that do not go through {@link request}. */
export async function csrfHeader(): Promise<Record<string, string>> {
  const token = csrfToken() ?? (await ensureCsrfToken())
  return token ? { [CSRF_HEADER]: token } : {}
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
  // With the token at hand the request leaves at once, before anything is awaited: a page that is being closed sends a
  // request with `keepalive` only from the handler of `pagehide` itself.
  const token = SAFE_METHODS.has(init.method ?? 'GET') ? undefined : (csrfToken() ?? (await ensureCsrfToken()))
  const response = await fetch(path, {
    ...init,
    headers: { Accept: accept, ...(token && { [CSRF_HEADER]: token }), ...init.headers },
  })
  if (!response.ok) {
    throw new HttpError(response.status, await problemOf(response))
  }
  return response
}

/** The problem details of an answer that is JSON, `undefined` for any other. */
export function parseProblem(contentType: string | null, body: string): Problem | undefined {
  if (!contentType?.includes('json')) return undefined
  try {
    return JSON.parse(body) as Problem
  } catch {
    return undefined
  }
}

async function problemOf(response: Response): Promise<Problem | undefined> {
  if (!response.headers.get('Content-Type')?.includes('json')) return undefined
  try {
    return (await response.json()) as Problem
  } catch {
    return undefined
  }
}
