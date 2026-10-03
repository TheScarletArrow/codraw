export interface ParticipantIdentity {
  name: string
  color: string
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

const STORAGE_KEY = 'codraw.guest'

let cachedIdentity: ParticipantIdentity | undefined

/**
 * Returns the guest name and color of this browser tab. They stay the same across reloads of the tab
 * (sessionStorage) and fall back to an in-memory value when storage is unavailable.
 */
export function getGuestIdentity(random: () => number = Math.random): ParticipantIdentity {
  cachedIdentity ??= readStored() ?? createIdentity(random)
  store(cachedIdentity)
  return cachedIdentity
}

function createIdentity(random: () => number): ParticipantIdentity {
  return {
    name: `Гость ${1 + Math.floor(random() * 999)}`,
    color: PARTICIPANT_COLORS[Math.floor(random() * PARTICIPANT_COLORS.length)]!,
  }
}

function readStored(): ParticipantIdentity | undefined {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as ParticipantIdentity | null
    return stored?.name && stored.color ? stored : undefined
  } catch {
    return undefined
  }
}

function store(identity: ParticipantIdentity) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(identity))
  } catch {
    // Storage can be disabled; the in-memory identity still lasts for this page.
  }
}

/** Test helper: forgets the identity cached for this page. */
export function resetGuestIdentityCache() {
  cachedIdentity = undefined
}
