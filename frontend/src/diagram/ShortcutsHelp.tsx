import { Client } from '@maxgraph/core'
import { Keyboard } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatKeys, shortcutGroups } from './shortcuts.ts'

/** The target of a key takes text itself: `?` is a character there. */
function takesText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  )
}

/** The shortcuts of the editor in one window, from a button of the board page or with `?`. */
export function ShortcutsHelp({ readOnly = false, isMac = Client.IS_MAC }: { readOnly?: boolean; isMac?: boolean }) {
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
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Горячие клавиши" title="Горячие клавиши (?)">
          <Keyboard />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="Горячие клавиши"
        className="max-h-[70vh] w-[30rem] overflow-y-auto"
      >
        <h2 className="mb-2 text-sm font-semibold">Горячие клавиши</h2>
        {shortcutGroups(readOnly).map((group) => (
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
