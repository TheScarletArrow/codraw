import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, Outlet, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { logout, type CurrentUser } from './api/auth.ts'
import { isUnauthorized } from './api/http.ts'
import { useCurrentUser } from './auth/session.ts'

/** Pages of a signed-in user; without a session it opens the login page. */
export function Layout() {
  const user = useCurrentUser()

  if (isUnauthorized(user.error)) return <Navigate to="/login" replace />

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b px-4">
        <Link to="/" className="font-bold">
          CoDraw
        </Link>
        {user.data && <UserMenu user={user.data} />}
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        {user.data && <Outlet />}
        {user.isPending && <p className="p-6 text-muted-foreground">Загрузка…</p>}
        {user.isError && (
          <p role="alert" className="p-6 text-destructive">
            Не удалось загрузить профиль
          </p>
        )}
      </main>
    </div>
  )
}

function UserMenu({ user }: { user: CurrentUser }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await navigate('/login', { replace: true })
      // Nothing of the previous user stays in the cache.
      queryClient.clear()
    },
  })

  return (
    <div className="ml-auto flex items-center gap-2 text-sm">
      {user.avatarUrl && <img src={user.avatarUrl} alt="" className="size-7 rounded-full" />}
      <span>{user.name}</span>
      {/* Signing out would cut a guest off from their boards; signing in through a provider keeps them. */}
      {user.guest ? (
        <Button asChild variant="ghost" size="sm">
          <Link to="/login">Войти</Link>
        </Button>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
          Выйти
        </Button>
      )}
    </div>
  )
}
