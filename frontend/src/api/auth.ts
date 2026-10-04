import { request } from './http.ts'

export interface CurrentUser {
  id: string
  name: string
  avatarUrl: string | null
  /** The user works without a sign-in provider. */
  guest: boolean
}

export type LoginProvider = 'github' | 'google'

export function fetchMe(): Promise<CurrentUser> {
  return request('/api/me')
}

/** Continues without a sign-in provider as a guest; a request that already has a session keeps it. */
export function continueAsGuest(): Promise<void> {
  return request('/api/guest', { method: 'POST' })
}

export function logout(): Promise<void> {
  return request('/api/logout', { method: 'POST' })
}

/** Where the browser goes to sign in: the backend sends it on to the provider and back to the app. */
export function loginUrl(provider: LoginProvider) {
  return `/api/oauth2/authorization/${provider}`
}
