import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { continueAsGuest } from '../api/auth.ts'
import { isTooManyRequests } from '../api/http.ts'
import { ME_QUERY_KEY, useLoginOptions } from '../auth/session.ts'
import { SignInButtons } from '../auth/SignInButtons.tsx'
import { loginMessages as m } from './LoginPage.messages.tsx'

/** The page of the app that sent the visitor to sign in, e.g. an invitation, or the list of boards. */
function returnPathOf(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/'
}

export function LoginPage() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const options = useLoginOptions()
  const guest = useMutation({
    mutationFn: continueAsGuest,
    onSuccess: async () => {
      // The profile is loaded again: the visitor now has a session.
      await queryClient.resetQueries({ queryKey: ME_QUERY_KEY })
      await navigate(returnPathOf(location.state), { replace: true })
    },
  })

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <section className="flex w-full max-w-sm flex-col gap-4 rounded-lg border p-6">
        <h1 className="text-2xl font-bold">CoDraw</h1>
        <p className="text-muted-foreground">{m.intro}</p>
        {(location.state as { accountDeleted?: unknown } | null)?.accountDeleted === true && (
          <p role="status" className="text-sm">
            {m.accountDeleted}
          </p>
        )}
        {/*
          The backend sends the user back here with `?error` when the provider did not sign them in, and with
          `?error=denied` when the restrictions of the provider of the installation turned them away.
        */}
        {params.has('error') && (
          <p role="alert" className="text-destructive">
            {params.get('error') === 'denied' ? m.denied : m.failed}
          </p>
        )}
        <SignInButtons />
        {options.data?.guests && (
          <Button type="button" variant="ghost" onClick={() => guest.mutate()} disabled={guest.isPending}>
            {m.asGuest}
          </Button>
        )}
        {options.data && options.data.providers.length === 0 && !options.data.guests && (
          <p className="text-muted-foreground">{m.notConfigured}</p>
        )}
        {options.isError && (
          <p role="alert" className="text-destructive">
            {m.optionsFailed}
          </p>
        )}
        {/* With `?blocked` when an administrator of the installation blocked the user. */}
        {params.has('blocked') && (
          <p role="alert" className="text-destructive">
            Учётная запись заблокирована администратором установки.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {m.consent(
            <Link to="/terms" className="underline">
              {m.terms}
            </Link>,
            <Link to="/privacy" className="underline">
              {m.privacy}
            </Link>,
          )}
        </p>
        {guest.isError && (
          <p role="alert" className="text-destructive">
            {isTooManyRequests(guest.error) ? m.tooManyGuests : m.guestFailed}
          </p>
        )}
      </section>
    </main>
  )
}
