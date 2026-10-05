import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  describeError,
  installErrorReporting,
  MAX_MESSAGE,
  MAX_REPORTS,
  MAX_STACK,
  reportError,
  setReportSender,
  type ErrorReport,
} from './reporting.ts'

describe('error reports', () => {
  let reports: ErrorReport[]

  beforeEach(() => {
    reports = []
    setReportSender((report) => reports.push(report))
    history.pushState(null, '', '/boards/42?page=p1#top')
  })

  afterEach(() => history.pushState(null, '', '/'))

  it('describes errors, strings and anything else thrown', () => {
    const error = new TypeError('x is undefined')

    expect(describeError(error)).toEqual({ message: 'TypeError: x is undefined', stack: error.stack })
    expect(describeError('Сломалось')).toEqual({ message: 'Сломалось' })
    expect(describeError({ code: 42 })).toEqual({ message: '{"code":42}' })
    expect(describeError(undefined)).toEqual({ message: 'undefined' })
  })

  it('sends the kind, the message, the stack and the path of the page without its query', () => {
    const error = new TypeError('x is undefined')

    reportError('error', error)

    expect(reports).toEqual([{ kind: 'error', message: 'TypeError: x is undefined', stack: error.stack, path: '/boards/42' }])
  })

  it('sends the same error once, and no more than the limit of reports', () => {
    const error = new Error('Повтор')
    for (let i = 0; i < 5; i++) reportError('error', error)
    expect(reports).toHaveLength(1)

    for (let i = 0; i < 2 * MAX_REPORTS; i++) reportError('render', new Error(`Ошибка ${i}`))
    expect(reports).toHaveLength(MAX_REPORTS)
  })

  it('cuts long messages and stacks to what the backend takes', () => {
    const error = new Error('x'.repeat(2 * MAX_MESSAGE))
    error.stack = 'y'.repeat(2 * MAX_STACK)

    reportError('error', error)

    expect(reports[0]!.message).toHaveLength(MAX_MESSAGE)
    expect(reports[0]!.stack).toHaveLength(MAX_STACK)
  })

  it('does not throw when sending fails', () => {
    setReportSender(() => {
      throw new Error('Нет сети')
    })

    expect(() => reportError('error', new Error('Ошибка'))).not.toThrow()
  })

  it('reports the errors the page leaves unhandled, but not those of scripts of other origins', () => {
    const page = new EventTarget() as Window
    installErrorReporting(page)

    page.dispatchEvent(
      new ErrorEvent('error', { error: new TypeError('Своя'), message: 'Своя', filename: `${location.origin}/assets/index.js` }),
    )
    page.dispatchEvent(
      new ErrorEvent('error', { error: new TypeError('Чужая'), message: 'Чужая', filename: 'chrome-extension://abc/content.js' }),
    )
    // A script of another origin hides its error: no error object, no file.
    page.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }))
    const rejection = new Event('unhandledrejection')
    Object.defineProperty(rejection, 'reason', { value: new Error('Отказ') })
    page.dispatchEvent(rejection)

    expect(reports.map(({ kind, message }) => [kind, message])).toEqual([
      ['error', 'TypeError: Своя'],
      ['unhandledrejection', 'Error: Отказ'],
    ])
  })
})
