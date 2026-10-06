/** Calls of a function at most once per interval; see {@link throttle}. */
export interface Throttled {
  /** Asks for a call: at once when the interval since the last one is over, otherwise once at its end. */
  run(): void
  /** Drops a call waiting for the end of the interval. */
  cancel(): void
}

/**
 * Calls `send` at most once per `interval` milliseconds: the first time at once, and a call asked for within the
 * interval once at its end. `send` reads the latest state itself, so the call at the end of the interval sends what
 * was asked last, and a timer that fires late never sends an older state after a newer one.
 */
export function throttle(send: () => void, interval: number): Throttled {
  let lastSent = -Infinity
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
  }
  return {
    run() {
      const now = performance.now()
      if (now - lastSent >= interval) {
        // A timer that has not fired yet, e.g. on a busy page, would send the same state again after this one.
        cancel()
        lastSent = now
        send()
        return
      }
      timer ??= setTimeout(() => {
        timer = undefined
        lastSent = performance.now()
        send()
      }, interval - (now - lastSent))
    },
    cancel,
  }
}
