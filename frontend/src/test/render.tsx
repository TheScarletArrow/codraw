import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { vi } from 'vitest'
import { createQueryClient } from '../queryClient.ts'

/** Renders routes in a memory router with a fresh query client, so tests can inspect navigation. */
export function renderRoutes(routes: RouteObject[], path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = createQueryClient()
  // Keep the production retry rules, but do not wait between attempts.
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 0 } })
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, unmount }
}

export interface MockResponse {
  status?: number
  body?: unknown
}

/** Replaces `fetch` with a stub that answers by `METHOD path`, e.g. `GET /api/boards`. */
export function mockFetch(responses: Record<string, MockResponse>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${input.toString()}`
    const response = responses[key]
    if (!response) {
      throw new Error(`Unexpected request: ${key}`)
    }
    const status = response.status ?? 200
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
