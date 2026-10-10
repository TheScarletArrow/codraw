import type { ReportReason } from '../api/publicBoards.ts'
import { reportMessages } from './messages.ts'

/** The reasons of a report, as the form names them. */
export const REPORT_REASONS: readonly { value: ReportReason; readonly label: string }[] = (
  ['spam', 'illegal', 'abuse', 'other'] as const
).map((value) => ({
  value,
  get label() {
    return reportMessages.reasons[value]
  },
}))
