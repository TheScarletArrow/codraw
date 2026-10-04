import type { CurrentUser } from '../api/auth.ts'

/** How a participant appears to the others: in the list of participants and at the cursor. */
export interface ParticipantIdentity {
  name: string
  color: string
  avatarUrl?: string | null
}

export const PARTICIPANT_COLORS = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#db2777',
  '#4d7c0f',
] as const

/** Identity of the user from the profile; the color is derived from the user id, so it is the same at every sign-in. */
export function participantIdentity(user: CurrentUser): ParticipantIdentity {
  return { name: user.name, avatarUrl: user.avatarUrl, color: participantColor(user.id) }
}

export function participantColor(userId: string): string {
  let hash = 0
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return PARTICIPANT_COLORS[Math.abs(hash) % PARTICIPANT_COLORS.length]!
}
