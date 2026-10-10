import type { Locale } from '../i18n/i18n.ts'
import { request } from './http.ts'

export interface CurrentUser {
  id: string
  name: string
  avatarUrl: string | null
  /** The user works without a sign-in provider. */
  guest: boolean
  /** The language of the interface in which letters and messages of notifications reach the user. */
  language?: Locale
}

export type LoginProvider = 'github' | 'google'

export function fetchMe(): Promise<CurrentUser> {
  return request('/api/me')
}

/** Continues without a sign-in provider as a guest; a request that already has a session keeps it. */
export function continueAsGuest(): Promise<void> {
  return request('/api/guest', { method: 'POST' })
}

/** Tells the backend the language of the interface, for the letters and messages of notifications of the user. */
export function saveLanguage(language: Locale): Promise<void> {
  return request('/api/me/language', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language }),
  })
}

export function logout(): Promise<void> {
  return request('/api/logout', { method: 'POST' })
}

/** Where the browser goes to sign in: the backend sends it on to the provider and back to the app. */
export function loginUrl(provider: LoginProvider) {
  return `/api/oauth2/authorization/${provider}`
}
