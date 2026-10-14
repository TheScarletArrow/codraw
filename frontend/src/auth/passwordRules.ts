/**
 * The rules of a login and a password of the backend (`PasswordRules`), repeated only to tell them before a request; the
 * backend checks them itself.
 */

/** Why a login or a password does not fit: the `reason` of the answers of the backend, and of the checks below. */
export type PasswordRuleProblem = 'login-invalid' | 'password-short' | 'password-long' | 'password-login'

export const PASSWORD_MIN_LENGTH = 8

/** bcrypt reads no more of a password. */
export const PASSWORD_MAX_BYTES = 72

const LOGIN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/

export function loginProblem(login: string): PasswordRuleProblem | null {
  return LOGIN.test(login) ? null : 'login-invalid'
}

/** In characters as people count them, an emoji one; in bytes of UTF-8 as bcrypt counts them. */
export function passwordProblem(login: string, password: string): PasswordRuleProblem | null {
  if ([...password].length < PASSWORD_MIN_LENGTH) return 'password-short'
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return 'password-long'
  if (password.toLowerCase() === login.toLowerCase()) return 'password-login'
  return null
}
