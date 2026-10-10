import { perLocale } from '../i18n/i18n.ts'

/** The time of a version, e.g. in the history: `versionTimeFormat().format(date)`. */
export const versionTimeFormat = perLocale((tag) => new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short' }))

/** Query key of the versions of a board. */
export const versionsKey = (boardId: string) => ['boards', boardId, 'versions'] as const
