import { request } from '../api/http.ts'

/** Where an error came from: the page, a rejected promise nobody handled, or drawing React components. */
export type ErrorKind = 'error' | 'unhandledrejection' | 'render'

/** What the backend gets about an error in the browser: never the content of boards. */
export interface ErrorReport {
  kind: ErrorKind
  message: string
  stack?: string
  /** The path of the page, without its query and hash. */
  path: string
}

/** Longest fields the backend takes. */
export const MAX_MESSAGE = 1000
export const MAX_STACK = 8000
export const MAX_PATH = 500

/** The most reports one load of the page sends: a broken page must not flood the log. */
export const MAX_REPORTS = 10

const reported = new Set<string>()

/** Sends a report and swallows its failure: reporting an error must not make new errors. */
let send = (report: ErrorReport): void => {
  void request('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
    // The report reaches the backend even when the page is being left.
    keepalive: true,
  }).catch(() => {})
}

/** Replaces the sending of reports, for tests; returns the reports to their first state. */
export function setReportSender(sender: (report: ErrorReport) => void) {
  send = sender
  reported.clear()
}

/** The message and the stack of anything thrown or rejected. */
export function describeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack }
  if (typeof error === 'string') return { message: error }
  try {
    return { message: JSON.stringify(error) ?? String(error) }
  } catch {
    return { message: String(error) }
  }
}

/**
 * Reports an error to the backend once per load of the page: the same kind, message and first line of the stack are
 * not sent again, nor anything after {@link MAX_REPORTS} reports.
 */
export function reportError(kind: ErrorKind, error: unknown) {
  try {
    const { message, stack } = describeError(error)
    const key = `${kind}\n${message}\n${stack?.split('\n').find((line) => line.trim().startsWith('at')) ?? ''}`
    if (reported.has(key) || reported.size >= MAX_REPORTS) return
    reported.add(key)
    send({
      kind,
      message: message.slice(0, MAX_MESSAGE) || 'Unknown error',
      ...(stack && { stack: stack.slice(0, MAX_STACK) }),
      path: location.pathname.slice(0, MAX_PATH),
    })
  } catch {
    // Nothing to do: a report that fails is lost.
  }
}

/** An error of a script of another origin, e.g. of an extension of the browser: not an error of CoDraw. */
function isForeign(event: ErrorEvent): boolean {
  if (!event.filename) return !event.error
  try {
    return new URL(event.filename, location.href).origin !== location.origin
  } catch {
    return true
  }
}

/** Reports the errors that the page and its promises leave unhandled. */
export function installErrorReporting(target: Window = window) {
  target.addEventListener('error', (event) => {
    // Failed loads of images and scripts are events without an error.
    if (!(event instanceof ErrorEvent) || isForeign(event)) return
    reportError('error', event.error ?? event.message)
  })
  target.addEventListener('unhandledrejection', (event) => reportError('unhandledrejection', event.reason))
}
