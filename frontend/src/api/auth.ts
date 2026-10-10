import type { Locale } from '../i18n/i18n.ts'
import { request } from './http.ts'

export interface CurrentUser {
  id: string
  name: string
  avatarUrl: string | null
  /** The user works without a sign-in provider. */
  guest: boolean
  /** The configuration of the installation makes the user its administrator. */
  admin: boolean
  /** The language of the interface in which letters and messages of notifications reach the user. */
  language?: Locale
}

/** A way to sign in that the installation offers: GitHub, Google or a provider of OpenID Connect of the operator. */
export interface LoginProvider {
  id: string
  /** Shown as «Войти через {name}». */
  name: string
}

export interface LoginOptions {
  providers: LoginProvider[]
  /** Whether «Продолжить без входа» creates guests. */
  guests: boolean
}

export const LOGIN_OPTIONS_QUERY_KEY = ['login-options'] as const

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

/** The ways to sign in of this installation; open without a sign-in. */
export function fetchLoginOptions(): Promise<LoginOptions> {
  return request('/api/auth/providers')
}

/**
 * Ends the session. For a provider that signs out at its side too, gives the address of its page that does it and
 * comes back to the login page.
 */
export async function logout(): Promise<string | null> {
  const response = await request<{ logoutUrl?: string } | undefined>('/api/logout', { method: 'POST' })
  return response?.logoutUrl ?? null
}

/** Where the browser goes to sign in: the backend sends it on to the provider and back to the app. */
export function loginUrl(providerId: string) {
  return `/api/oauth2/authorization/${encodeURIComponent(providerId)}`
}
