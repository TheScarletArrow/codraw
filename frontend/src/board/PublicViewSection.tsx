import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { shareMessages as m } from './share.messages.ts'

/** How long «Скопировано» replaces «Копировать код», in milliseconds. */
const COPIED_DURATION = 2_000

/** Code that embeds the board, on the page `pageId`, into a page of another site: the board for reading without a sign-in. */
function embedCode(boardId: string, pageId: string | null, origin = window.location.origin) {
  const url = new URL(`/view/${encodeURIComponent(boardId)}`, origin)
  if (pageId) url.searchParams.set('page', pageId)
  return `<iframe src="${url}" width="800" height="600" style="border:0" allowfullscreen></iframe>`
}

/** For a board that its link shows to anybody: the code that embeds it into a wiki or a site, and a button to copy it. */
export function PublicViewSection({ boardId, pageId }: { boardId: string; pageId: string | null }) {
  const [copied, setCopied] = useState(false)
  const code = embedCode(boardId, pageId)

  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(false), COPIED_DURATION)
    return () => clearTimeout(timeout)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // The code is in the field, ready to be copied by hand.
    }
  }

  return (
    <section aria-label={m.embed} className="flex flex-col gap-1.5">
      <h3 className="text-sm font-medium">{m.embed}</h3>
      <p className="text-xs text-muted-foreground">
        {m.embedAbout}
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          aria-label={m.embedCode}
          value={code}
          className="h-8 min-w-0 flex-1 rounded-md border bg-muted/50 px-2 text-sm"
          onFocus={(event) => event.target.select()}
        />
        <Button type="button" variant="outline" size="sm" className="w-32" onClick={() => void copy()}>
          {copied ? m.copied : m.copyCode}
        </Button>
      </div>
    </section>
  )
}
