import { Client } from '@maxgraph/core'
import { Keyboard } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { takesText } from '../lib/keyboard.ts'
import { shortcutMessages as m } from './shortcuts.messages.ts'
import { formatKeys, shortcutGroups } from './shortcuts.ts'

interface ShortcutsHelpProps {
  readOnly?: boolean
  /** The page works on a board with others: the shortcuts of working together are listed. */
  collaboration?: boolean
  isMac?: boolean
}

/** The shortcuts of the editor in one window, from a button of the board page or with `?`. */
export function ShortcutsHelp({ readOnly = false, collaboration = true, isMac = Client.IS_MAC }: ShortcutsHelpProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey || takesText(event.target)) return
      event.preventDefault()
      setOpen((current) => !current)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={m.help} title={m.helpButton}>
          <Keyboard />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={m.help}
        className="max-h-[70vh] w-[30rem] overflow-y-auto"
      >
        <h2 className="mb-2 text-sm font-semibold">{m.help}</h2>
        {shortcutGroups(readOnly, collaboration).map((group) => (
          <section key={group.title} aria-label={group.title} className="mb-3 last:mb-0">
            <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.title}</h3>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 text-sm">
              {group.entries.map((entry) => (
                <div key={entry.action} className="contents">
                  <dt>{entry.action}</dt>
                  <dd className="flex flex-wrap items-start justify-end gap-1">
                    {[...new Set(entry.keys.map((keys) => formatKeys(keys, isMac)))].map((keys) => (
                      <kbd key={keys} className="rounded border bg-muted px-1.5 font-mono text-xs whitespace-nowrap">
                        {keys}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </PopoverContent>
    </Popover>
  )
}
