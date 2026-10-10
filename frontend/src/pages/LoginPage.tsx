import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { continueAsGuest, loginUrl } from '../api/auth.ts'
import { isTooManyRequests } from '../api/http.ts'
import { ME_QUERY_KEY } from '../auth/session.ts'

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
        <p className="text-muted-foreground">Войдите, чтобы работать со своими досками.</p>
        {(location.state as { accountDeleted?: unknown } | null)?.accountDeleted === true && (
          <p role="status" className="text-sm">
            Учётная запись удалена. Новый вход создаст новую пустую учётную запись.
          </p>
        )}
        {/* The backend sends the user back here with `?error` when the provider did not sign them in. */}
        {params.has('error') && (
          <p role="alert" className="text-destructive">
            Вход не выполнен. Попробуйте ещё раз.
          </p>
        )}
        <Button asChild>
          <a href={loginUrl('github')}>Войти через GitHub</a>
        </Button>
        <Button asChild variant="outline">
          <a href={loginUrl('google')}>Войти через Google</a>
        </Button>
        <Button type="button" variant="ghost" onClick={() => guest.mutate()} disabled={guest.isPending}>
          Продолжить без входа
        </Button>
        <p className="text-xs text-muted-foreground">
          Входя или продолжая без входа, вы принимаете{' '}
          <Link to="/terms" className="underline">
            условия использования
          </Link>{' '}
          и{' '}
          <Link to="/privacy" className="underline">
            политику конфиденциальности
          </Link>
          .
        </p>
        {guest.isError && (
          <p role="alert" className="text-destructive">
            {isTooManyRequests(guest.error)
              ? 'Слишком много новых гостей с вашего адреса. Попробуйте позже или войдите через GitHub или Google.'
              : 'Не удалось продолжить без входа. Попробуйте ещё раз.'}
          </p>
        )}
      </section>
    </main>
  )
}
