import { describe, expect, it } from 'vitest'
import { participantColor, participantIdentity, PARTICIPANT_COLORS } from './identity.ts'

describe('participantIdentity', () => {
  const user = { id: '0199a000-0000-7000-8000-0000000000a1', name: 'Алиса', avatarUrl: 'https://avatars.example.com/a.png', guest: false, admin: false }

  it('takes the name and the avatar from the profile', () => {
    expect(participantIdentity(user)).toMatchObject({ name: 'Алиса', avatarUrl: 'https://avatars.example.com/a.png' })
  })

  it('gives the user the same palette color at every sign-in', () => {
    const color = participantIdentity(user).color

    expect(PARTICIPANT_COLORS).toContain(color)
    expect(participantIdentity({ ...user, name: 'Алиса Л.' }).color).toBe(color)
  })

  it('spreads users over the palette', () => {
    const ids = Array.from({ length: 32 }, (_, i) => `0199a000-0000-7000-8000-${String(i).padStart(12, '0')}`)

    expect(new Set(ids.map(participantColor)).size).toBeGreaterThan(PARTICIPANT_COLORS.length / 2)
  })
})
