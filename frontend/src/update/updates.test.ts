import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockFetch } from '../test/render.tsx'
import {
  CHECK_INTERVAL_MS,
  checkForUpdate,
  MIN_CHECK_GAP_MS,
  reportNewerDocument,
  resetUpdates,
  startUpdateChecks,
  updateState,
} from './updates.ts'
import { currentBuild } from './version.ts'

const OTHER = { version: currentBuild.version, build: `${currentBuild.build}-next` }

function setVisibility(state: DocumentVisibilityState) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
  document.dispatchEvent(new Event('visibilitychange'))
}

/** Lets the pending check answer. */
const settle = () => vi.advanceTimersByTimeAsync(0)

describe('startUpdateChecks', () => {
  let stop: () => void = () => {}

  beforeEach(() => {
    resetUpdates()
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  })

  afterEach(() => {
    stop()
    stop = () => {}
    resetUpdates()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('asks the server every five minutes while the tab is in sight, and learns of another build', async () => {
    const fetchMock = mockFetch({ 'GET /version.json': [{ body: currentBuild }, { body: OTHER }] })
    stop = startUpdateChecks()

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS - 1)
    expect(fetchMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(updateState().available).toBe(false)

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(updateState()).toEqual({ available: true, newerDocument: false })
  })

  it('does not ask while the tab is hidden', async () => {
    const fetchMock = mockFetch({ 'GET /version.json': { body: OTHER } })
    stop = startUpdateChecks()
    setVisibility('hidden')

    await vi.advanceTimersByTimeAsync(3 * CHECK_INTERVAL_MS)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(updateState().available).toBe(false)
  })

  it('asks when the user comes back to the tab', async () => {
    const fetchMock = mockFetch({ 'GET /version.json': { body: OTHER } })
    stop = startUpdateChecks()

    setVisibility('hidden')
    await settle()
    expect(fetchMock).not.toHaveBeenCalled()

    setVisibility('visible')
    await settle()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(updateState().available).toBe(true)
  })

  it('asks when the network comes back, at most once in a while', async () => {
    const fetchMock = mockFetch({ 'GET /version.json': { body: currentBuild } })
    stop = startUpdateChecks()

    window.dispatchEvent(new Event('online'))
    await settle()
    setVisibility('visible')
    window.dispatchEvent(new Event('online'))
    await settle()
    expect(fetchMock).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(MIN_CHECK_GAP_MS)
    window.dispatchEvent(new Event('online'))
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(updateState().available).toBe(false)
  })

  it('asks at once when a part of the app has not loaded, even right after another check', async () => {
    const fetchMock = mockFetch({ 'GET /version.json': [{ body: currentBuild }, { body: OTHER }] })
    stop = startUpdateChecks()

    window.dispatchEvent(new Event('online'))
    await settle()
    const preloadError = new Event('vite:preloadError', { cancelable: true })
    window.dispatchEvent(preloadError)
    await settle()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(updateState().available).toBe(true)
    // The failed import still fails for the code that asked for it.
    expect(preloadError.defaultPrevented).toBe(false)
  })

  it('stops asking once it knows of another build', async () => {
    const fetchMock = mockFetch({ 'GET /version.json': { body: OTHER } })
    stop = startUpdateChecks()

    window.dispatchEvent(new Event('online'))
    await settle()
    expect(updateState().available).toBe(true)

    await vi.advanceTimersByTimeAsync(2 * CHECK_INTERVAL_MS)
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('vite:preloadError'))
    await settle()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('shows nothing when the server does not answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    stop = startUpdateChecks()

    window.dispatchEvent(new Event('vite:preloadError'))
    await settle()
    expect(updateState().available).toBe(false)
  })

  it('asks again at the next chance after the server did not answer, e.g. while it restarted', async () => {
    const fetchMock = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')))
    vi.stubGlobal('fetch', fetchMock)
    stop = startUpdateChecks()

    window.dispatchEvent(new Event('online'))
    await settle()
    window.dispatchEvent(new Event('online'))
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops listening once stopped', async () => {
    const fetchMock = mockFetch({ 'GET /version.json': { body: OTHER } })
    startUpdateChecks()()

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    setVisibility('visible')
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('vite:preloadError'))
    await settle()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('checkForUpdate', () => {
  beforeEach(() => {
    resetUpdates()
  })

  afterEach(() => {
    resetUpdates()
    vi.unstubAllGlobals()
  })

  it('asks once for checks that come while one is on its way', async () => {
    const fetchMock = mockFetch({ 'GET /version.json': { body: OTHER } })

    await Promise.all([checkForUpdate({ force: true }), checkForUpdate({ force: true })])

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(updateState().available).toBe(true)
  })
})

describe('reportNewerDocument', () => {
  beforeEach(() => {
    resetUpdates()
  })

  afterEach(() => {
    resetUpdates()
  })

  it('tells of a newer document until every such document is closed', () => {
    const closeFirst = reportNewerDocument()
    const closeSecond = reportNewerDocument()
    expect(updateState().newerDocument).toBe(true)

    closeFirst()
    expect(updateState().newerDocument).toBe(true)
    // Closing the same document twice does not count for the other one.
    closeFirst()
    expect(updateState().newerDocument).toBe(true)

    closeSecond()
    expect(updateState().newerDocument).toBe(false)
  })
})
