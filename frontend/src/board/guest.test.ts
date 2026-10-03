import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getGuestIdentity, PARTICIPANT_COLORS, resetGuestIdentityCache } from './guest.ts'

describe('getGuestIdentity', () => {
  beforeEach(() => {
    sessionStorage.clear()
    resetGuestIdentityCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a guest name and a palette color', () => {
    const identity = getGuestIdentity(() => 0.5)

    expect(identity.name).toBe('Гость 500')
    expect(PARTICIPANT_COLORS).toContain(identity.color)
  })

  it('keeps names within 1..999', () => {
    expect(getGuestIdentity(() => 0).name).toBe('Гость 1')
    resetGuestIdentityCache()
    sessionStorage.clear()
    expect(getGuestIdentity(() => 0.9999).name).toBe('Гость 999')
  })

  it('keeps the identity across reloads of the same tab', () => {
    const first = getGuestIdentity(() => 0.1)
    resetGuestIdentityCache()

    expect(getGuestIdentity(() => 0.9)).toEqual(first)
  })

  it('works when sessionStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    const first = getGuestIdentity(() => 0.2)

    expect(getGuestIdentity(() => 0.7)).toBe(first)
  })
})
