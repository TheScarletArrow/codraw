import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { continueAsGuest, loginUrl } from '../api/auth.ts'
import { isTooManyRequests } from '../api/http.ts'
import { ME_QUERY_KEY } from '../auth/session.ts'

export function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const guest = useMutation({
    mutationFn: continueAsGuest,
    onSuccess: async () => {
      // The profile is loaded again: the visitor now has a session.
      await queryClient.resetQueries({ queryKey: ME_QUERY_KEY })
      await navigate('/', { replace: true })
    },
  })

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <section className="flex w-full max-w-sm flex-col gap-4 rounded-lg border p-6">
        <h1 className="text-2xl font-bold">CoDraw</h1>
        <p className="text-muted-foreground">Войдите, чтобы работать со своими досками.</p>
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
