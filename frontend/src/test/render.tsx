import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { vi } from 'vitest'
import type { CurrentUser } from '../api/auth.ts'
import { createQueryClient } from '../queryClient.ts'

/** The signed-in user that page tests answer `GET /api/me` with. */
export const ALICE: CurrentUser = {
  id: '0199a000-0000-7000-8000-0000000000a1',
  name: 'Алиса',
  avatarUrl: 'https://avatars.example.com/alice.png',
  guest: false,
}

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

/**
 * Replaces `fetch` with a stub that answers by `METHOD path`, e.g. `GET /api/boards`.
 * A list of responses is answered in order, repeating the last one.
 */
export function mockFetch(responses: Record<string, MockResponse | MockResponse[]>) {
  const calls = new Map<string, number>()
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${input.toString()}`
    const answers = [responses[key] ?? []].flat()
    const call = calls.get(key) ?? 0
    calls.set(key, call + 1)
    const response = answers[Math.min(call, answers.length - 1)]
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
