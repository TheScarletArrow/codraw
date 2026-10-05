import { HocuspocusProvider } from '@hocuspocus/provider'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { fetchCollabToken } from '../api/boards.ts'
import { isForbidden, isNotFound, isUnauthorized } from '../api/http.ts'
import { recheckSession } from '../auth/session.ts'
import type { ParticipantIdentity } from './identity.ts'
import { BOARD_CHANGED, isBoardChanged } from './messages.ts'
import { participantPage, type Awareness } from './presence.ts'

/** `forbidden`: the owner closed the link to the board, and the participant has no access to it any more. */
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
 * Reason of collab closing the connection after the owner changed the access to the board: the provider reconnects with
 * a token for the new access.
 */
const ACCESS_CHANGED = 'access-changed'

export function collabUrl(location: Location = window.location) {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/collab`
}

/**
 * Connects to the shared document of a board and tracks the connection status and participants. The document is
 * handed out once its stored state has arrived; initializing it is up to a participant who may edit the board.
 */
export function useBoardConnection(boardId: string, identity: ParticipantIdentity) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [participants, setParticipants] = useState<Participant[]>([])
  /** The board document and the participants' awareness, available once the document has been synced. */
  const [session, setSession] = useState<{ document: Y.Doc; awareness: Awareness } | null>(null)
  const providerRef = useRef<HocuspocusProvider | null>(null)

  useEffect(() => {
    const document = new Y.Doc()
    const refetchBoard = () => queryClient.invalidateQueries({ queryKey: ['boards', boardId], exact: true })
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
      // reconnecting after an earlier change, missed the message about it: the board tells their role again.
      onAuthenticated: () => {
        if (authenticated) void refetchBoard()
        authenticated = true
      },
      onAuthenticationFailed: ({ reason }) => {
        if (reason === BOARD_NOT_FOUND) {
          setStatus('not-found')
          // The board will not appear by reconnecting.
          provider.disconnect()
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
        }
      },
      // Another participant renamed or deleted the board: its title, or its absence, comes from the API.
      onStateless: ({ payload }) => {
        if (isBoardChanged(payload)) void refetchBoard()
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
      providerRef.current = null
      provider.destroy()
      document.destroy()
    }
  }, [boardId, identity, queryClient])

  /** Tells the other participants that the board changed, e.g. its title, so that they fetch it again. */
  const notifyBoardChanged = useCallback(() => providerRef.current?.sendStateless(BOARD_CHANGED), [])

  return {
    status,
    participants,
    document: session?.document ?? null,
    awareness: session?.awareness ?? null,
    notifyBoardChanged,
  }
}
