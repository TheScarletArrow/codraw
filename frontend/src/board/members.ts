import type { BoardRole } from '../api/boards.ts'
import type { Invite } from '../api/members.ts'

/** Query key of the owner and the members of a board. */
export const membersKey = (boardId: string) => ['boards', boardId, 'members'] as const

/** Query key of the users who opened a board through its link and are not its members. */
export const visitorsKey = (boardId: string) => ['boards', boardId, 'visitors'] as const

/** Query key of the invitation links of a board. */
export const invitesKey = (boardId: string) => ['boards', boardId, 'invites'] as const

/** Roles as the window «Поделиться» names them, in the words of the modes of the link. */
export const ROLE_LABELS: Record<BoardRole, string> = {
  owner: 'Владелец',
  editor: 'Редактирование',
  viewer: 'Просмотр',
}

/** The address of an invitation as it is sent to others. */
export function inviteUrl(invite: Pick<Invite, 'path'>, origin = window.location.origin) {
  return new URL(invite.path, origin).toString()
}

const pluralRules = new Intl.PluralRules('ru')

/** The count with the word in its form for it: «1 участник», «2 участника», «5 участников». */
export function counted(count: number, [one, few, many]: [string, string, string]) {
  const rule = pluralRules.select(count)
  return `${count} ${rule === 'one' ? one : rule === 'few' ? few : many}`
}
