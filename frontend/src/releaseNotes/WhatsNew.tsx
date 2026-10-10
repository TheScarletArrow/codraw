import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { locale } from '../i18n/i18n.ts'
import { whatsNewMessages as m } from './messages.ts'
import { releases, type Release } from './releases.ts'
import { markReleasesSeen, releaseDate, releasesToShow } from './whatsNew.ts'

/**
 * «Что нового» in the header of the app: opens by itself once after an update with the releases not seen in this browser,
 * and from its button with all of them, newest first. The novelties are shown in the language of the interface.
 */
export function WhatsNew({ className }: { className?: string }) {
  // Read once, when the app opens: what this browser has not seen yet.
  const [unseen] = useState(releasesToShow)
  const [shown, setShown] = useState<Release[]>(unseen.length > 0 ? unseen : releases)
  const [open, setOpen] = useState(unseen.length > 0)
  const language = locale()

  useEffect(() => markReleasesSeen(), [])

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setShown(releases)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={m.whatsNew}
          title={m.whatsNew}
          className={cn('shrink-0', className)}
        >
          <Sparkles />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={m.whatsNew} className="max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto">
        <h2 className="font-semibold">{m.heading}</h2>
        {shown.map((release) => (
          <section key={release.version} aria-label={m.version(release.version)} className="mt-3">
            <h3 className="text-sm font-medium">
              {m.version(release.version)} <span className="font-normal text-muted-foreground">· {releaseDate(release.date)}</span>
            </h3>
            <ul className="mt-1 space-y-1.5 text-sm">
              {release.items.map(({ [language]: { title, text } }) => (
                <li key={title}>
                  <span className="font-medium">{title}.</span> {text}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {shown.length < releases.length && (
          <Button type="button" variant="link" size="sm" className="mt-2 px-0" onClick={() => setShown(releases)}>
            {m.allVersions}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
