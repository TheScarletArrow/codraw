import type { Invite } from '../api/members.ts'
import { pluralRu } from '../i18n/i18n.ts'

/** Query key of the owner and the members of a board. */
export const membersKey = (boardId: string) => ['boards', boardId, 'members'] as const

/** Query key of the users who opened a board through its link and are not its members. */
export const visitorsKey = (boardId: string) => ['boards', boardId, 'visitors'] as const

/** Query key of the invitation links of a board. */
export const invitesKey = (boardId: string) => ['boards', boardId, 'invites'] as const

/** The address of an invitation as it is sent to others. */
export function inviteUrl(invite: Pick<Invite, 'path'>, origin = window.location.origin) {
  return new URL(invite.path, origin).toString()
}

/**
 * The count with the Russian word in its form for it: «1 участник», «2 участника», «5 участников». Texts of the
 * dictionaries use `pluralRu` and `pluralEn` instead.
 */
export function counted(count: number, [one, few, many]: [string, string, string]) {
  return `${count} ${pluralRu(count, one, few, many)}`
}
