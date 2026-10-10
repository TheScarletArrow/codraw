import type { ReportReason } from '../api/publicBoards.ts'

/** The reasons of a report, as the form names them. */
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Спам или реклама' },
  { value: 'illegal', label: 'Незаконное содержимое' },
  { value: 'abuse', label: 'Оскорбления или травля' },
  { value: 'other', label: 'Другое' },
]
