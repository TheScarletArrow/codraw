import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { throttle } from './throttle.ts'

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls at once, then once at the end of the interval however often it is asked within it', () => {
    const send = vi.fn()
    const throttled = throttle(send, 50)

    throttled.run()
    throttled.run()
    throttled.run()
    expect(send).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(49)
    expect(send).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(send).toHaveBeenCalledTimes(2)

    // The interval runs from the call at its end.
    throttled.run()
    expect(send).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(50)
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('calls at once again after a quiet interval', () => {
    const send = vi.fn()
    const throttled = throttle(send, 50)

    throttled.run()
    vi.advanceTimersByTime(60)
    throttled.run()

    expect(send).toHaveBeenCalledTimes(2)
  })

  it('drops the call at the end of the interval when cancelled', () => {
    const send = vi.fn()
    const throttled = throttle(send, 50)

    throttled.run()
    throttled.run()
    throttled.cancel()
    vi.advanceTimersByTime(100)

    expect(send).toHaveBeenCalledTimes(1)
  })
})
