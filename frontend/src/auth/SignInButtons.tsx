import { Link, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { loginUrl } from '../api/auth.ts'
import { loginMessages as m } from '../pages/LoginPage.messages.tsx'
import { passwordMessages } from './PasswordForm.messages.ts'
import { useLoginOptions } from './session.ts'

/**
 * «Войти через …» for every provider of the installation, the first one the main button unless [secondary]. Away from
 * the login page, [passwordLink] adds «Войти по логину и паролю», which opens the login page and comes back here.
 */
export function SignInButtons({ passwordLink = false, secondary = false }: { passwordLink?: boolean; secondary?: boolean }) {
  const options = useLoginOptions()
  const location = useLocation()
  const providers = options.data?.providers ?? []
  const showPasswordLink = passwordLink && Boolean(options.data?.password)
  const lead = !secondary && !showPasswordLink
  return (
    <>
      {showPasswordLink && (
        <Button asChild>
          <Link to="/login" state={{ from: `${location.pathname}${location.search}` }}>
            {passwordMessages.signInWithPassword}
          </Link>
        </Button>
      )}
      {providers.map((provider, index) => (
        <Button key={provider.id} asChild variant={index === 0 && lead ? 'default' : 'outline'}>
          <a href={loginUrl(provider.id)}>{m.signInWith(provider.name)}</a>
        </Button>
      ))}
    </>
  )
}
