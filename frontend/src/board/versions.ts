import type { VersionReason } from '../api/versions.ts'

export const REASON_LABELS: Record<VersionReason, string> = {
  auto: 'Автоматически',
  manual: 'Вручную',
  restore: 'Перед восстановлением',
  proposal: 'Перед принятием предложения',
}

export const versionTimeFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })

/** Query key of the versions of a board. */
export const versionsKey = (boardId: string) => ['boards', boardId, 'versions'] as const
