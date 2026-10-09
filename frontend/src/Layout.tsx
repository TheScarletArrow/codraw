import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { logout, type CurrentUser } from './api/auth.ts'
import { isUnauthorized } from './api/http.ts'
import { useCurrentUser } from './auth/session.ts'
import { HeaderSlotProvider } from './headerSlot.tsx'
import { NotificationBell } from './notifications/NotificationBell.tsx'
import { deleteLocalCopiesOf, keepLocalCopiesOf } from './offline/localCopies.ts'
import { WhatsNew } from './releaseNotes/WhatsNew.tsx'
import { ThemeMenu } from './theme/ThemeMenu.tsx'

/**
 * Pages of a signed-in user, with their notifications and the novelties of CoDraw in the header; without a session it opens the login page, which
 * comes back to the page, e.g. an invitation, once the visitor continues as a guest.
 */
export function Layout() {
  const user = useCurrentUser()
  const location = useLocation()
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null)
  // Another user signed in in this browser, or a guest signed in through a provider: the local copies of the boards of
  // the previous user go.
  const userId = user.data?.id
  useEffect(() => {
    if (userId) void keepLocalCopiesOf(userId)
  }, [userId])

  if (isUnauthorized(user.error)) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b px-4">
        <Link to="/" className="font-bold">
          CoDraw
        </Link>
        {user.data && (
          <>
            {/* What the page shows in the header, e.g. who is on the board: the rest of the line is its room. */}
            <div ref={setHeaderSlot} className="ml-auto flex min-w-0 items-center" />
            <WhatsNew />
            <NotificationBell />
            <UserMenu user={user.data} />
          </>
        )}
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <HeaderSlotProvider slot={headerSlot}>{user.data && <Outlet />}</HeaderSlotProvider>
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
      // Nothing of the previous user stays in the cache, nor in the browser.
      queryClient.clear()
      await deleteLocalCopiesOf(user.id)
    },
  })

  return (
    <div className="flex shrink-0 items-center gap-2 text-sm">
      {user.avatarUrl && <img src={user.avatarUrl} alt="" className="size-7 rounded-full" />}
      <span>{user.name}</span>
      <ThemeMenu />
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
