import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import type { Board } from '../api/boards.ts'
import { disableEmbed, enableEmbed, type Embed } from '../api/embed.ts'
import { embedKey, embedMarkdown, embedUrl } from './links.ts'
import { embedMessages as m } from './messages.ts'
import { publishEmbed } from './useEmbedPublisher.ts'

/** How long «Скопировано» replaces the label of a copy button, in milliseconds. */
const COPIED_DURATION = 2_000

interface EmbedSectionProps {
  board: Board
  embed: Embed | null | undefined
  pages: { id: string; name: string }[]
  /** The page the participant is on: the image shows it when the owner turns it on. */
  pageId: string | null
  document: Y.Doc | null
  /** Tells the other participants that the image changed, so that their browsers publish it too. */
  onChanged: () => void
}

/**
 * «Живая картинка»: the owner turns on the image of a page that follows the changes of the board, for documents that
 * embed it; everybody copies its address or Markdown once it is on.
 */
export function EmbedSection({ board, embed, pages, pageId, document, onChanged }: EmbedSectionProps) {
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState<'link' | 'markdown' | null>(null)
  // The choice shows at once, before the request ends, so that the box does not jump back.
  const [wanted, setWanted] = useState<boolean | null>(null)
  const isOwner = board.role === 'owner'

  const changed = (next: Embed | null) => {
    queryClient.setQueryData(embedKey(board.id), next)
    onChanged()
    // The picture of the page goes out at once, not with the next change.
    if (next && document) void publishEmbed(board.id, document, next.pageId).catch(() => {})
  }
  const settled = () => setWanted(null)
  const enable = useMutation({ mutationFn: (page: string) => enableEmbed(board.id, page), onSuccess: changed, onSettled: settled })
  const disable = useMutation({ mutationFn: () => disableEmbed(board.id), onSuccess: () => changed(null), onSettled: settled })
  const pending = enable.isPending || disable.isPending

  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(null), COPIED_DURATION)
    return () => clearTimeout(timeout)
  }, [copied])

  const copy = async (text: string, what: 'link' | 'markdown') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
    } catch {
      // The address is in the field, ready to be copied by hand.
    }
  }

  if (!isOwner && !embed) return null
  return (
    <section aria-label={m.liveImage} className="flex flex-col gap-1.5 border-t pt-3">
      {isOwner ? (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={wanted ?? Boolean(embed)}
            disabled={pending || !pageId}
            onChange={(event) => {
              setWanted(event.target.checked)
              if (event.target.checked) {
                if (pageId) enable.mutate(pageId)
              } else {
                disable.mutate()
              }
            }}
          />
          {m.liveImage}
        </label>
      ) : (
        <h3 className="text-sm font-medium">{m.liveImage}</h3>
      )}
      <p className="text-xs text-muted-foreground">
        {embed
          ? m.liveOn
          : m.liveOff}
      </p>
      {embed && (
        <>
          {isOwner && (
            <label className="flex items-center gap-2 text-sm">
              {m.page}
              <select
                aria-label={m.imagePage}
                className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                value={embed.pageId}
                disabled={pending}
                onChange={(event) => enable.mutate(event.target.value)}
              >
                {pages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <input
            readOnly
            aria-label={m.imageLink}
            value={embedUrl(embed)}
            className="h-8 min-w-0 rounded-md border bg-muted/50 px-2 text-sm"
            onFocus={(event) => event.target.select()}
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => void copy(embedUrl(embed), 'link')}>
              {copied === 'link' ? m.copied : m.copyLink}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => void copy(embedMarkdown(embed, board.title), 'markdown')}
            >
              {copied === 'markdown' ? m.copied : m.copyMarkdown}
            </Button>
          </div>
        </>
      )}
      {(enable.isError || disable.isError) && (
        <p role="alert" className="text-sm text-destructive">
          {m.changeFailed}
        </p>
      )}
    </section>
  )
}
