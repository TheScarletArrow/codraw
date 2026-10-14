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
  /** The user signs in with a login and a password, which they change on «Учётная запись». */
  password?: boolean
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
  /** Signing in with a login and a password, and whether visitors register themselves; `null` when it is off. */
  password?: { signUp: boolean } | null
}

export const LOGIN_OPTIONS_QUERY_KEY = ['login-options'] as const

export function fetchMe(): Promise<CurrentUser> {
  return request('/api/me')
}

/** Continues without a sign-in provider as a guest; a request that already has a session keeps it. */
export function continueAsGuest(): Promise<void> {
  return request('/api/guest', { method: 'POST' })
}

function postJson(path: string, body: unknown, method = 'POST'): Promise<void> {
  return request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

/** Signs in with a login and a password; a guest passes their boards to the account. */
export function signInWithPassword(login: string, password: string): Promise<void> {
  return postJson('/api/auth/password/sign-in', { login, password })
}

/** Registers an account with a login and a password and signs in to it; a guest passes their boards to it. */
export function signUpWithPassword(login: string, password: string): Promise<void> {
  return postJson('/api/auth/password/sign-up', { login, password })
}

/** Changes the password of the signed-in user; their other sessions end. */
export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return postJson('/api/me/password', { currentPassword, newPassword }, 'PUT')
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
