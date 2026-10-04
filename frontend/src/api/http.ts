export class HttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Request failed with status ${status}`)
    this.name = 'HttpError'
    this.status = status
  }
}

export const isNotFound = (error: unknown) => error instanceof HttpError && error.status === 404

export const isUnauthorized = (error: unknown) => error instanceof HttpError && error.status === 401

/** The owner closed the link to the board. */
export const isForbidden = (error: unknown) => error instanceof HttpError && error.status === 403

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
  const token = SAFE_METHODS.has(init.method ?? 'GET') ? undefined : await ensureCsrfToken()
  const response = await fetch(path, {
    ...init,
    headers: { Accept: 'application/json', ...(token && { [CSRF_HEADER]: token }), ...init.headers },
  })
  if (!response.ok) {
    throw new HttpError(response.status)
  }
  return (response.status === 204 ? undefined : await response.json()) as T
}
