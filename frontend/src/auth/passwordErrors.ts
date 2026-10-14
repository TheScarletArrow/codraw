import { HttpError } from '../api/http.ts'
import { passwordMessages as m } from './PasswordForm.messages.ts'
import type { PasswordRuleProblem } from './passwordRules.ts'

export const passwordInputClass =
  'h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

/** What a rule of a login or a password that a request broke says. */
export function ruleMessage(problem: PasswordRuleProblem): string {
  switch (problem) {
    case 'login-invalid':
      return m.loginInvalid
    case 'password-short':
      return m.passwordShort
    case 'password-long':
      return m.passwordLong
    case 'password-login':
      return m.passwordLogin
  }
}

/** The `reason` of a refusal of the backend, e.g. `login-taken`. */
export function reasonOf(error: unknown): string | undefined {
  return error instanceof HttpError ? error.problem?.reason : undefined
}
