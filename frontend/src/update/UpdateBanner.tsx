import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { updateMessages as m } from './messages.ts'
import { flushUnsavedWork, prepareReload } from './reload.ts'
import { useUpdateState } from './updates.ts'

type Step = 'idle' | 'saving' | 'unsaved' | 'offline'

/**
 * A banner at the bottom of every page once the server gives a newer build, or once an open board is saved by one. It
 * never reloads by itself: «Обновить» first saves the edits of the page, and warns when some would be lost.
 */
export function UpdateBanner({ reload = () => location.reload() }: { reload?: () => void }) {
  const { available, newerDocument } = useUpdateState()
  const [hidden, setHidden] = useState(false)
  const [step, setStep] = useState<Step>('idle')
  // A board that this tab cannot edit keeps the banner: «Позже» would leave the user wondering why it does not change.
  if (!newerDocument && (!available || hidden)) return null

  const update = async () => {
    // The browser would show its page of no connection in place of the app, which works without one.
    if (!navigator.onLine) {
      setStep('offline')
      return
    }
    setStep('saving')
    if (await prepareReload()) reload()
    else setStep('unsaved')
  }
  const reloadAnyway = () => {
    flushUnsavedWork()
    reload()
  }
  const texts: Record<Step, string> = {
    idle: newerDocument ? m.newerDocument : m.available,
    saving: m.saving,
    unsaved: m.unsaved,
    offline: m.offline,
  }
  const text = texts[step]

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-background px-3 py-2 text-sm shadow-lg"
      >
        <RefreshCw aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">{text}</span>
        {step === 'unsaved' || step === 'offline' ? (
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={reloadAnyway}>
            {m.reloadAnyway}
          </Button>
        ) : (
          <Button type="button" size="sm" className="shrink-0" disabled={step === 'saving'} onClick={() => void update()}>
            {m.reload}
          </Button>
        )}
        {!newerDocument && (
          <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setHidden(true)}>
            {m.later}
          </Button>
        )}
      </div>
    </div>
  )
}
