import { useCallback, useEffect, useRef, useState } from 'react'
import type { DiagramEditor } from '../diagram/editor.ts'
import type { PageInfo } from '../diagram/pages.ts'
import {
  currentPresentation,
  presentationStart,
  readRemotePresence,
  useFollowingPublisher,
  useRemotePresence,
  type Awareness,
  type RemotePresence,
} from './presence.ts'

export interface FollowingOptions {
  awareness: Awareness | null
  editor: DiagramEditor | null
  pages: PageInfo[]
  currentPageId: string | null
  /** Opens a page of the board, as the tabs do. */
  selectPage: (id: string) => void
}

export interface Following {
  /** The participant whose page, view and scale the canvas repeats; `null` when it repeats nobody's. */
  leader: RemotePresence | null
  /** Another participant who presents to everybody. */
  presenter: RemotePresence | null
  /** Whether the participant presents to everybody. */
  presenting: boolean
  /** How many participants follow the participant. */
  followers: number
  /**
   * Follows another participant; a participant who publishes no view is gone to once: their page and their cursor. The
   * presenter follows nobody: the others would follow whom they follow.
   */
  follow: (clientId: number) => void
  /** Stops following: the viewer moved the canvas, opened a page or pressed Escape on their own. */
  stop: () => void
  /** Starts presenting to everybody, taking over a presentation of another participant. */
  startPresenting: () => void
  stopPresenting: () => void
}

/** The presentation a client has answered: following starts on its own once for each one. */
interface Answered {
  key: string | null
  presenter: number | null
}

/**
 * Following another participant, chosen in the list of participants or presenting to everybody, and presenting: the
 * canvas takes the page, the middle of the view and the scale of the leader until the viewer moves on their own, the
 * leader leaves or their presentation ends.
 */
export function useFollowing({ awareness, editor, pages, currentPageId, selectPage }: FollowingOptions): Following {
  const presence = useRemotePresence(awareness)
  const [leaderId, setLeaderId] = useState<number | null>(null)
  const [presentingSince, setPresentingSince] = useState<number | null>(null)

  const self = awareness?.clientID ?? null
  const own = self !== null && presentingSince !== null ? { clientId: self, since: presentingSince } : null
  const presentation = currentPresentation(presence, own)
  // Another participant started presenting later: this presentation is over. Without a connection there is nobody to
  // compare with, and the presentation goes on over the next connection.
  if (own && presentation?.clientId !== self) setPresentingSince(null)

  // A new presentation — started, taken over, or running when the board opens — brings the viewer to its presenter,
  // and one's own presentation ends one's following. A viewer who moved away is not brought back to the same one.
  // When the presentation ends, so does following its presenter.
  const key = presentation && `${presentation.clientId}@${presentation.since}`
  const [answered, setAnswered] = useState<Answered>({ key: null, presenter: null })
  if (key !== answered.key) {
    setAnswered({ key, presenter: presentation?.clientId ?? null })
    if (presentation) setLeaderId(presentation.clientId === self ? null : presentation.clientId)
    else if (leaderId !== null && leaderId === answered.presenter) setLeaderId(null)
  }

  // A participant who has left is followed no more.
  const leader = (leaderId !== null && presence.find((participant) => participant.clientId === leaderId)) || null
  const presenting = own !== null && presentation?.clientId === self
  const presenter =
    (!presenting && presentation && presence.find((participant) => participant.clientId === presentation.clientId)) ||
    null
  const followers = presenting ? presence.filter((participant) => participant.following === self).length : 0
  useFollowingPublisher(awareness, presentingSince, leader?.clientId ?? null)

  const stop = useCallback(() => setLeaderId(null), [])
  // The page of the leader, then the middle of their view and their scale once the canvas of that page is shown.
  useEffect(() => {
    if (!leader?.viewport) return
    if (leader.page !== currentPageId) {
      if (pages.some((page) => page.id === leader.page)) selectPage(leader.page)
      return
    }
    // Waiting for the canvas of the leader's page.
    if (!editor || editor.pageId !== leader.page) return
    editor.zoomTo(leader.viewport.scale)
    editor.centerOn(leader.viewport)
  }, [leader, editor, currentPageId, pages, selectPage])
  const isFollowing = leader !== null
  useEffect(() => {
    if (!isFollowing) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') stop()
    }
    window.document.addEventListener('keydown', handleKey)
    return () => window.document.removeEventListener('keydown', handleKey)
  }, [isFollowing, stop])

  // Going to a participant who publishes no view: switch to their page, then centre their cursor once that page is
  // shown.
  const going = useRef<number | null>(null)
  const centreOn = useCallback(
    (editor: DiagramEditor, clientId: number) => {
      const target = awareness && readRemotePresence(awareness).find((participant) => participant.clientId === clientId)
      // Waiting for the canvas of the participant's page.
      if (target && target.page !== editor.pageId) return false
      if (target?.cursor) editor.centerOn(target.cursor)
      return true
    },
    [awareness],
  )
  useEffect(() => {
    if (editor && going.current !== null && centreOn(editor, going.current)) going.current = null
  }, [editor, centreOn])
  const follow = (clientId: number) => {
    const target = presence.find((participant) => participant.clientId === clientId)
    if (!target || presenting) return
    if (target.viewport) {
      setLeaderId(clientId)
      return
    }
    if (editor && target.page === editor.pageId) {
      centreOn(editor, clientId)
    } else if (pages.some((page) => page.id === target.page)) {
      going.current = clientId
      selectPage(target.page)
    }
  }

  return {
    leader,
    presenter,
    presenting,
    followers,
    follow,
    stop,
    startPresenting: () => setPresentingSince(presentationStart(presence)),
    stopPresenting: () => setPresentingSince(null),
  }
}
