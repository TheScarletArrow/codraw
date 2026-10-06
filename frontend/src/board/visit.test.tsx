import { act, renderHook } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reportVisit, startVisit, type ChangesSinceVisit } from '../api/visits.ts'
import { authorNames, useBoardVisit, visitTime, VISIT_REPORT_INTERVAL_MS } from './visit.ts'

vi.mock('../api/visits.ts', () => ({ startVisit: vi.fn(), reportVisit: vi.fn(async () => {}) }))

const changes: ChangesSinceVisit = {
  since: '2026-10-05T15:40:00Z',
  authors: [{ id: 'bob', name: 'Боб', avatarUrl: null }],
  baseline: { id: 'v1', createdAt: '2026-10-05T16:00:00Z' },
}

/** The reports so far: `PUT` while the user is on the board, `DELETE` when they left. */
const reports = () => vi.mocked(reportVisit).mock.calls.map(([, left]) => (left ? 'DELETE' : 'PUT'))

function setVisibility(state: DocumentVisibilityState) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useBoardVisit', () => {
  let answer: (changes: ChangesSinceVisit) => void

  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    vi.mocked(reportVisit).mockClear()
    vi.mocked(startVisit).mockReset()
    vi.mocked(startVisit).mockImplementation(() => new Promise((resolve) => (answer = resolve)))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /** Renders the hook in strict mode, which runs its effects twice, as development does. */
  function renderVisit(boardId = 'board') {
    return renderHook(({ id }) => useBoardVisit(id), {
      initialProps: { id: boardId },
      wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
    })
  }

  async function begin() {
    await act(async () => answer(changes))
  }

  it('begins the visit once and answers what changed since the previous one', async () => {
    const { result } = renderVisit()
    expect(result.current).toBeNull()

    await begin()

    expect(startVisit).toHaveBeenCalledExactlyOnceWith('board')
    expect(result.current).toEqual(changes)
  })

  it('reports nothing before the visit has begun, then every minute while the tab is in sight', async () => {
    renderVisit()
    act(() => vi.advanceTimersByTime(2 * VISIT_REPORT_INTERVAL_MS))
    expect(reports()).toEqual([])

    await begin()
    act(() => vi.advanceTimersByTime(VISIT_REPORT_INTERVAL_MS - 1))
    expect(reports()).toEqual([])
    act(() => vi.advanceTimersByTime(1))
    expect(reports()).toEqual(['PUT'])
    act(() => vi.advanceTimersByTime(VISIT_REPORT_INTERVAL_MS))
    expect(reports()).toEqual(['PUT', 'PUT'])
  })

  it('reports nothing while the tab is hidden, and at once when it is shown again', async () => {
    renderVisit()
    await begin()

    act(() => setVisibility('hidden'))
    act(() => vi.advanceTimersByTime(5 * VISIT_REPORT_INTERVAL_MS))
    expect(reports()).toEqual([])

    act(() => setVisibility('visible'))
    expect(reports()).toEqual(['PUT'])
    act(() => vi.advanceTimersByTime(VISIT_REPORT_INTERVAL_MS))
    expect(reports()).toEqual(['PUT', 'PUT'])
  })

  it('only tells that the user left when a reload hides the tab after closing the page', async () => {
    renderVisit()
    await begin()

    act(() => window.dispatchEvent(new Event('pagehide')))
    act(() => setVisibility('hidden'))

    expect(reports()).toEqual(['DELETE'])
  })

  it('tells that the user left when the page is closed or left', async () => {
    const { unmount } = renderVisit()
    await begin()

    act(() => window.dispatchEvent(new Event('pagehide')))
    expect(reports()).toEqual(['DELETE'])

    unmount()
    expect(reports()).toEqual(['DELETE', 'DELETE'])
    act(() => vi.advanceTimersByTime(5 * VISIT_REPORT_INTERVAL_MS))
    expect(reports()).toEqual(['DELETE', 'DELETE'])
    expect(vi.mocked(reportVisit).mock.calls.every(([boardId]) => boardId === 'board')).toBe(true)
  })

  it('tells that the user left while the page does not show the board, and reports again once it does', async () => {
    const { rerender } = renderHook(({ shown }) => useBoardVisit('board', shown), { initialProps: { shown: true } })
    await begin()

    rerender({ shown: false })
    act(() => vi.advanceTimersByTime(5 * VISIT_REPORT_INTERVAL_MS))
    expect(reports()).toEqual(['DELETE'])

    rerender({ shown: true })
    act(() => vi.advanceTimersByTime(VISIT_REPORT_INTERVAL_MS))
    expect(reports()).toEqual(['DELETE', 'PUT'])
    expect(startVisit).toHaveBeenCalledOnce()
  })

  it('begins a visit of another board, and answers nothing when the visit could not begin', async () => {
    const { result, rerender } = renderVisit()
    await begin()

    vi.mocked(startVisit).mockRejectedValueOnce(new Error('offline'))
    rerender({ id: 'other' })
    expect(result.current).toBeNull()
    await act(async () => {})

    expect(startVisit).toHaveBeenLastCalledWith('other')
    expect(result.current).toBeNull()
    // The board that was left hears it.
    expect(vi.mocked(reportVisit).mock.calls).toEqual([['board', true]])
  })
})

describe('authorNames', () => {
  const authors = (...names: string[]) => names.map((name) => ({ id: name, name, avatarUrl: null }))

  it('names up to three authors and counts the others', () => {
    expect(authorNames(authors('Боб'))).toBe('Боб')
    expect(authorNames(authors('Аня', 'Боб'))).toBe('Аня и Боб')
    expect(authorNames(authors('Аня', 'Боб', 'Вера'))).toBe('Аня, Боб и Вера')
    expect(authorNames(authors('Аня', 'Боб', 'Вера', 'Глеб', 'Дина'))).toBe('Аня, Боб, Вера и ещё 2')
  })
})

describe('visitTime', () => {
  const now = new Date(2026, 9, 6, 10, 0)

  it('names the day by the calendar of the user', () => {
    expect(visitTime(new Date(2026, 9, 6, 9, 15), now)).toBe('сегодня в 9:15')
    expect(visitTime(new Date(2026, 9, 5, 18, 40), now)).toBe('вчера в 18:40')
    expect(visitTime(new Date(2026, 9, 5, 0, 5), now)).toBe('вчера в 0:05')
    expect(visitTime(new Date(2026, 9, 3, 18, 40), now)).toBe('3 октября в 18:40')
    expect(visitTime(new Date(2025, 11, 31, 23, 59), now)).toBe('31 декабря 2025 г. в 23:59')
  })
})
