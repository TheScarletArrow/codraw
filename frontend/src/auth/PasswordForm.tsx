import { useMutation } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { signInWithPassword, signUpWithPassword } from '../api/auth.ts'
import { HttpError } from '../api/http.ts'
import { loginMessages } from '../pages/LoginPage.messages.tsx'
import { passwordMessages as m } from './PasswordForm.messages.ts'
import { passwordInputClass, reasonOf, ruleMessage } from './passwordErrors.ts'
import { loginProblem, passwordProblem } from './passwordRules.ts'

function failureMessage(error: unknown): string {
  const reason = reasonOf(error)
  if (error instanceof HttpError) {
    if (error.status === 401) return m.invalidCredentials
    if (error.status === 429) return reason === 'sign-ups' ? m.tooManySignUps : m.tooManyAttempts
  }
  switch (reason) {
    case 'login-taken':
      return m.loginTaken
    case 'login-reserved':
      return m.loginReserved
    case 'blocked':
      return loginMessages.blocked
    case 'sign-up-off':
      return m.signUpOff
    case 'login-invalid':
    case 'password-short':
    case 'password-long':
    case 'password-login':
      return ruleMessage(reason)
    default:
      return m.failed
  }
}

/**
 * Signing in with a login and a password, and, when the installation lets visitors register themselves, registering:
 * «Зарегистрироваться» turns the form into one with the password twice.
 */
export function PasswordForm({ signUpAllowed, onSignedIn }: { signUpAllowed: boolean; onSignedIn: () => Promise<void> }) {
  const id = useId()
  const [signingUp, setSigningUp] = useState(false)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const submit = useMutation({
    mutationFn: () => (signingUp ? signUpWithPassword(login, password) : signInWithPassword(login, password)),
    onSuccess: onSignedIn,
  })
  const switchTo = (signUp: boolean) => {
    setSigningUp(signUp)
    setProblem(null)
    setRepeat('')
    submit.reset()
  }
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (signingUp) {
      const broken = loginProblem(login) ?? passwordProblem(login, password)
      if (broken) return setProblem(ruleMessage(broken))
      if (password !== repeat) return setProblem(m.mismatch)
    }
    setProblem(null)
    submit.mutate()
  }
  const error = problem ?? (submit.isError ? failureMessage(submit.error) : null)

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-label={signingUp ? m.signUp : m.signIn}>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-login`} className="text-sm">
          {m.login}
        </label>
        <input
          id={`${id}-login`}
          className={passwordInputClass}
          value={login}
          onChange={(event) => setLogin(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={100}
          aria-describedby={signingUp ? `${id}-login-hint` : undefined}
        />
        {signingUp && (
          <p id={`${id}-login-hint`} className="text-xs text-muted-foreground">
            {m.loginHint}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-password`} className="text-sm">
          {m.password}
        </label>
        <input
          id={`${id}-password`}
          type="password"
          className={passwordInputClass}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={signingUp ? 'new-password' : 'current-password'}
          required
          aria-describedby={signingUp ? `${id}-password-hint` : undefined}
        />
        {signingUp && (
          <p id={`${id}-password-hint`} className="text-xs text-muted-foreground">
            {m.passwordHint}
          </p>
        )}
      </div>
      {signingUp && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-repeat`} className="text-sm">
            {m.repeatPassword}
          </label>
          <input
            id={`${id}-repeat`}
            type="password"
            className={passwordInputClass}
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={submit.isPending}>
        {signingUp ? (submit.isPending ? m.signingUp : m.signUp) : submit.isPending ? m.signingIn : m.signIn}
      </Button>
      {signUpAllowed && (
        <Button type="button" variant="link" className="h-auto p-0" onClick={() => switchTo(!signingUp)}>
          {signingUp ? m.toSignIn : m.toSignUp}
        </Button>
      )}
    </form>
  )
}
