import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareReload, registerUnsavedWork, RELOAD_KEY, RELOAD_WINDOW_MS, reloadOnce, SAVE_TIMEOUT_MS } from './reload.ts'

describe('reloadOnce', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('reloads the page and remembers the moment', () => {
    const reload = vi.fn()

    expect(reloadOnce(reload)).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem(RELOAD_KEY)).toBe(String(Date.now()))
  })

  it('does not reload again within a minute, so that it cannot loop', () => {
    const reload = vi.fn()
    reloadOnce(reload)

    vi.advanceTimersByTime(RELOAD_WINDOW_MS - 1)
    expect(reloadOnce(reload)).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('reloads again after a minute, as the next deployment in the same tab needs', () => {
    const reload = vi.fn()
    reloadOnce(reload)

    vi.advanceTimersByTime(RELOAD_WINDOW_MS)
    expect(reloadOnce(reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('reloads when the remembered moment is not a moment', () => {
    sessionStorage.setItem(RELOAD_KEY, 'чепуха')
    const reload = vi.fn()

    expect(reloadOnce(reload)).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('does not reload when the storage of the session cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Access is denied', 'SecurityError')
    })
    const reload = vi.fn()

    expect(reloadOnce(reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not reload when the storage of the session cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    const reload = vi.fn()

    expect(reloadOnce(reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('prepareReload', () => {
  const unregister: (() => void)[] = []
  const register = (work: Parameters<typeof registerUnsavedWork>[0]) => unregister.push(registerUnsavedWork(work))

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    for (const take of unregister.splice(0)) take()
    vi.useRealTimers()
  })

  /** Whether the promise has settled, and with what, after the timers have run for this long. */
  async function settleWithin<T>(promise: Promise<T>, ms: number) {
    let result: { value: T } | null = null
    void promise.then((value) => (result = { value }))
    await vi.advanceTimersByTimeAsync(ms)
    return result as { value: T } | null
  }

  it('is ready at once when no page has edits to lose', async () => {
    expect(await settleWithin(prepareReload(), 100)).toEqual({ value: true })
  })

  it('applies the half done edits and waits until they are saved', async () => {
    let unsaved = true
    const flush = vi.fn()
    register({ flush, unsaved: () => unsaved })

    const ready = prepareReload()
    expect(flush).toHaveBeenCalledOnce()
    expect(await settleWithin(ready, 1000)).toBeNull()

    unsaved = false
    expect(await settleWithin(ready, 200)).toEqual({ value: true })
  })

  it('waits for edits that the flush itself makes, which the page learns of a moment later', async () => {
    let unsaved = false
    register({ flush: () => setTimeout(() => (unsaved = true), 10), unsaved: () => unsaved })

    const ready = prepareReload()
    expect(await settleWithin(ready, 500)).toBeNull()

    unsaved = false
    expect(await settleWithin(ready, 200)).toEqual({ value: true })
  })

  it('gives up when the edits are not saved in time', async () => {
    register({ flush: () => {}, unsaved: () => true })

    const ready = prepareReload()
    expect(await settleWithin(ready, SAVE_TIMEOUT_MS - 200)).toBeNull()
    expect(await settleWithin(ready, 300)).toEqual({ value: false })
  })

  it('lets the other pages apply their edits when one cannot', async () => {
    const flush = vi.fn()
    register({
      flush: () => {
        throw new Error('Не вышло')
      },
      unsaved: () => false,
    })
    register({ flush, unsaved: () => false })

    expect(await settleWithin(prepareReload(), 100)).toEqual({ value: true })
    expect(flush).toHaveBeenCalledOnce()
  })

  it('forgets a page that has been closed', async () => {
    const flush = vi.fn()
    const take = registerUnsavedWork({ flush, unsaved: () => true })
    take()

    expect(await settleWithin(prepareReload(), 100)).toEqual({ value: true })
    expect(flush).not.toHaveBeenCalled()
  })
})
