import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { updateMessages as m } from './messages.ts'
import { reloadOnce } from './reload.ts'

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/**
 * Shown in place of a page whose file did not load, e.g. after a deployment in a tab opened before it. The page that the
 * user left is gone already, so the app reloads the same address once by itself; without a connection it waits for one,
 * and a reload that did not help leaves the page with a button instead of reloading in a loop.
 */
export function StaleClient() {
  const [offline, setOffline] = useState(isOffline)
  const [reloading, setReloading] = useState(false)
  // Effects run twice in development: the second run would find the mark of the first reload and give up.
  const attempted = useRef(false)

  useEffect(() => {
    if (offline) {
      const onOnline = () => {
        setOffline(false)
      }
      window.addEventListener('online', onOnline)
      return () => window.removeEventListener('online', onOnline)
    }
    if (attempted.current) return
    attempted.current = true
    setReloading(reloadOnce())
  }, [offline])

  if (reloading) {
    return (
      <div role="status" className="flex min-h-svh items-center justify-center p-6 text-muted-foreground">
        {m.reloading}
      </div>
    )
  }
  return (
    <div role="alert" className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">{offline ? m.offlineTitle : m.staleTitle}</h1>
      <p className="max-w-md text-muted-foreground">{offline ? m.offlineText : m.staleText}</p>
      <Button type="button" onClick={() => location.reload()}>
        {m.reloadPage}
      </Button>
    </div>
  )
}
