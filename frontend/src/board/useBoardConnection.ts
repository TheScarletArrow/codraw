import { HocuspocusProvider } from '@hocuspocus/provider'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { fetchCollabToken } from '../api/boards.ts'
import { isForbidden, isNotFound, isUnauthorized } from '../api/http.ts'
import { recheckSession } from '../auth/session.ts'
import type { ParticipantIdentity } from './identity.ts'
import { threadsKey } from '../comments/threads.ts'
import { embedKey } from '../embed/links.ts'
import { membersKey } from './members.ts'
import { BOARD_CHANGED, changeOf, COMMENTS_CHANGED } from './messages.ts'
import { participantPage, type Awareness } from './presence.ts'

/** `forbidden`: the owner closed the link to the board or removed the participant, who has no access to it any more. */
export type ConnectionStatus = 'connecting' | 'synced' | 'offline' | 'not-found' | 'forbidden'

export interface Participant extends ParticipantIdentity {
  clientId: number
  isSelf: boolean
  /** The page the participant works on. */
  page: string
}

/** Reason that collab sends when the board does not exist, also when it closes the connections of a deleted board. */
const BOARD_NOT_FOUND = 'board-not-found'

/**
 * Reason of collab closing the connection after the owner changed the access to the board: the provider reconnects and
 * gets the new access.
 */
const ACCESS_CHANGED = 'access-changed'

/** Reason of collab rejecting a participant whom the board gives no access, e.g. the owner just closed the link. */
const NO_ACCESS = 'no-access'

/** Reason of collab closing the connection of a participant whose change would make the board larger than allowed. */
const DOCUMENT_TOO_LARGE = 'document-too-large'

/** WebSocket close code of a message larger than the server takes. */
const MESSAGE_TOO_BIG = 1009

export function collabUrl(location: Location = window.location) {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/collab`
}

/**
 * Connects to the shared document of a board and tracks the connection status and participants. The document is
 * handed out once its stored state has arrived; initializing it is up to a participant who may edit the board.
 *
 * `viewer` tells whether the role of the participant that the page fetched lets them only view the board.
 */
export function useBoardConnection(boardId: string, identity: ParticipantIdentity, viewer: boolean) {
  const queryClient = useQueryClient()
  const viewerRef = useRef(viewer)
  useEffect(() => {
    viewerRef.current = viewer
  }, [viewer])
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [participants, setParticipants] = useState<Participant[]>([])
  /**
   * Collab gives every connection the access the board gives when it connects, which the role the page fetched before
   * may not match yet: the page edits only over a connection that accepts changes.
   */
  const [readOnly, setReadOnly] = useState(false)
  /** The board document and the participants' awareness, available once the document has been synced. */
  const [session, setSession] = useState<{ document: Y.Doc; awareness: Awareness } | null>(null)
  /** Collab refused a change because of the size of the board; the page connects again with a fresh document. */
  const [tooLarge, setTooLarge] = useState(false)
  const [generation, setGeneration] = useState(0)
  const providerRef = useRef<HocuspocusProvider | null>(null)

  useEffect(() => {
    const document = new Y.Doc()
    const refetchBoard = () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['boards', boardId], exact: true }),
        // The owner may have turned the live image on or off, or changed the members.
        queryClient.invalidateQueries({ queryKey: embedKey(boardId), exact: true }),
        queryClient.invalidateQueries({ queryKey: membersKey(boardId), exact: true }),
      ])
    let authenticated = false
    const provider = new HocuspocusProvider({
      url: collabUrl(),
      name: boardId,
      document,
      // Called before every connection, so a reconnect after the previous token has expired gets a new one.
      token: async () => {
        try {
          return (await fetchCollabToken(boardId)).token
        } catch (error) {
          if (isNotFound(error)) {
            setStatus('not-found')
            provider.disconnect()
          } else if (isForbidden(error)) {
            setStatus('forbidden')
            provider.disconnect()
            void refetchBoard()
          } else if (isUnauthorized(error)) {
            void recheckSession(queryClient)
          }
          throw error
        }
      },
      onSynced: ({ state }) => {
        if (!state) return
        setSession((current) => current ?? { document, awareness: provider.awareness! })
        setStatus('synced')
      },
      onStatus: ({ status }) => {
        if (status === 'disconnected') {
          setStatus((current) => (current === 'not-found' || current === 'forbidden' ? current : 'offline'))
        }
      },
      // Every connection gets the access the board gives now. A participant who was offline while it changed, e.g.
      // reconnecting after an earlier change, missed the message about it: the board tells their role again. So does
      // a first connection whose access differs from the role the page fetched just before.
      onAuthenticated: ({ scope }) => {
        const connectionReadOnly = scope === 'readonly'
        setReadOnly(connectionReadOnly)
        if (authenticated || connectionReadOnly !== viewerRef.current) void refetchBoard()
        authenticated = true
      },
      onAuthenticationFailed: ({ reason }) => {
        if (reason === BOARD_NOT_FOUND) {
          setStatus('not-found')
          // The board will not appear by reconnecting.
          provider.disconnect()
        } else if (reason === NO_ACCESS) {
          setStatus('forbidden')
          provider.disconnect()
          void refetchBoard()
        }
      },
      // Collab closes the connections of a board that was deleted while participants worked on it, and the connections
      // whose access changed: the provider reconnects then, and the page gets the new role of the participant.
      onClose: ({ event }) => {
        if (event.reason === BOARD_NOT_FOUND) {
          setStatus('not-found')
          provider.disconnect()
        } else if (event.reason === ACCESS_CHANGED) {
          void refetchBoard()
        } else if (event.reason === DOCUMENT_TOO_LARGE || event.code === MESSAGE_TOO_BIG) {
          // The document has a change that collab never takes, and the provider would send it again on every
          // reconnection: the page drops the document and gets the board as collab has it.
          setTooLarge(true)
          setStatus('connecting')
          setGeneration((current) => current + 1)
        }
      },
      // Another participant renamed or deleted the board: its title, or its absence, comes from the API. So do the
      // comments that another participant changed.
      onStateless: ({ payload }) => {
        const change = changeOf(payload)
        if (change === 'board-changed') void refetchBoard()
        else if (change === 'comments-changed') void queryClient.invalidateQueries({ queryKey: threadsKey(boardId) })
      },
    })
    providerRef.current = provider

    const awareness = provider.awareness!
    const updateParticipants = () => {
      const list: Participant[] = []
      awareness.getStates().forEach((state, clientId) => {
        const user = state.user as ParticipantIdentity | undefined
        if (user?.name && user.color) {
          list.push({
            clientId,
            name: user.name,
            color: user.color,
            avatarUrl: user.avatarUrl,
            isSelf: clientId === awareness.clientID,
            page: participantPage(state),
          })
        }
      })
      list.sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || a.name.localeCompare(b.name, 'ru'))
      setParticipants(list)
    }
    awareness.on('change', updateParticipants)
    provider.setAwarenessField('user', identity)
    updateParticipants()

    return () => {
      awareness.off('change', updateParticipants)
      setSession(null)
      setReadOnly(false)
      providerRef.current = null
      provider.destroy()
      document.destroy()
    }
  }, [boardId, identity, queryClient, generation])

  /** Tells the other participants that the board changed, e.g. its title, so that they fetch it again. */
  const notifyBoardChanged = useCallback(() => providerRef.current?.sendStateless(BOARD_CHANGED), [])

  /** Tells the other participants that the comments changed, so that they fetch them again. */
  const notifyCommentsChanged = useCallback(() => providerRef.current?.sendStateless(COMMENTS_CHANGED), [])

  const dismissTooLarge = useCallback(() => setTooLarge(false), [])

  return {
    status,
    readOnly,
    tooLarge,
    dismissTooLarge,
    participants,
    document: session?.document ?? null,
    awareness: session?.awareness ?? null,
    notifyBoardChanged,
    notifyCommentsChanged,
  }
}
