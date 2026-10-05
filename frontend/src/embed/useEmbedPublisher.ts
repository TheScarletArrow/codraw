import { useEffect } from 'react'
import * as Y from 'yjs'
import { publishEmbedImage, type Embed } from '../api/embed.ts'
import { getCells } from '../diagram/model.ts'
import { renderPageSvg } from './renderPage.ts'

/** Quiet time after the last change before the picture is drawn, in milliseconds. */
export const PUBLISH_QUIET = 3_000

/** The least time between two pictures from one browser, in milliseconds. */
export const PUBLISH_INTERVAL = 10_000

/** Draws the page of the live image and publishes it; failures wait for the next change. */
export async function publishEmbed(boardId: string, document: Y.Doc, pageId: string): Promise<void> {
  const svg = renderPageSvg(document, pageId)
  if (svg !== null) await publishEmbedImage(boardId, pageId, svg)
}

/**
 * Keeps the live image of the board up to date with the changes of this participant: after their change of the page of
 * the image, once the page is quiet, but not more often than every {@link PUBLISH_INTERVAL}. Changes of others are
 * published by their own browsers; a participant who may only view publishes nothing.
 */
export function useEmbedPublisher(boardId: string, document: Y.Doc | null, embed: Embed | null | undefined, canEdit: boolean) {
  const pageId = embed?.pageId ?? null
  useEffect(() => {
    if (!document || !pageId || !canEdit) return
    const cells = getCells(document, pageId)
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = 0
    const publish = () => {
      last = Date.now()
      void publishEmbed(boardId, document, pageId).catch(() => {})
    }
    const changed = (_events: unknown, transaction: Y.Transaction) => {
      // Changes that came from collab are of other participants.
      if (!transaction.local) return
      clearTimeout(timer)
      timer = setTimeout(publish, Math.max(PUBLISH_QUIET, last + PUBLISH_INTERVAL - Date.now()))
    }
    cells.observeDeep(changed)
    return () => {
      cells.unobserveDeep(changed)
      clearTimeout(timer)
    }
  }, [boardId, document, pageId, canEdit])
}
