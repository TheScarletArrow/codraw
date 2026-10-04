import { HocuspocusProvider } from '@hocuspocus/provider'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { fetchCollabToken, type BoardRole } from '../api/boards.ts'
import { isForbidden, isNotFound, isUnauthorized } from '../api/http.ts'
import { recheckSession } from '../auth/session.ts'
import { initializeDocument } from '../diagram/model.ts'
import type { ParticipantIdentity } from './identity.ts'
import { BOARD_CHANGED, isBoardChanged } from './messages.ts'
import { participantPage, type Awareness } from './presence.ts'

export type ConnectionStatus = 'connecting' | 'synced' | 'offline' | 'not-found' | 'forbidden'

export interface Participant extends ParticipantIdentity {
  clientId: number
  isSelf: boolean
  /** The page the participant works on. */
  page: string
}

/** Reason that collab sends when the board does not exist, also when it closes the connections of a deleted board. */
const BOARD_NOT_FOUND = 'board-not-found'

/** Reason that collab sends when a token gives no access, also when it closes a connection whose access ended. */
const PERMISSION_DENIED = 'permission-denied'

export function collabUrl(location: Location = window.location) {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/collab`
}

/**
 * Connects to the shared document of a board and tracks the connection status and participants. `role` is the role
 * the page shows; a token that gives another one makes the page fetch the board again.
 */
export function useBoardConnection(boardId: string, identity: ParticipantIdentity, role: BoardRole) {
  const queryClient = useQueryClient()
  const roleRef = useRef(role)
  useEffect(() => {
    roleRef.current = role
  }, [role])
  // A new connection, with a new document, after collab closed one whose access ended.
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [participants, setParticipants] = useState<Participant[]>([])
  /** The board document and the participants' awareness, available once the document has been synced. */
  const [session, setSession] = useState<{ document: Y.Doc; awareness: Awareness } | null>(null)
  const providerRef = useRef<HocuspocusProvider | null>(null)

  useEffect(() => {
    const refreshBoard = () => queryClient.invalidateQueries({ queryKey: ['boards', boardId], exact: true })
    const document = new Y.Doc()
    const provider = new HocuspocusProvider({
      url: collabUrl(),
      name: boardId,
      document,
      // Called before every connection, so a reconnect after the previous token has expired gets a new one.
      // Also called on an open connection when collab checks the access again.
      token: async () => {
        try {
          const { token, role } = await fetchCollabToken(boardId)
          // The owner changed the access to the board: the page catches up with the new role.
          if (role !== roleRef.current) void refreshBoard()
          return token
        } catch (error) {
          if (isNotFound(error)) {
            setStatus('not-found')
            provider.disconnect()
          } else if (isForbidden(error)) {
            setStatus('forbidden')
            provider.disconnect()
          } else if (isUnauthorized(error)) {
            void recheckSession(queryClient)
          }
          throw error
        }
      },
      onSynced: ({ state }) => {
        if (!state) return
        // Initialize only after the stored state has arrived, so that a non-empty board is never overwritten.
        initializeDocument(document)
        setSession((current) => current ?? { document, awareness: provider.awareness! })
        setStatus('synced')
      },
      onStatus: ({ status }) => {
        if (status === 'disconnected') setStatus((current) => (current === 'not-found' ? current : 'offline'))
      },
      onAuthenticationFailed: ({ reason }) => {
        if (reason === BOARD_NOT_FOUND) {
          setStatus('not-found')
          // The board will not appear by reconnecting.
          provider.disconnect()
        }
      },
      // Collab closes the connections of a board that was deleted while participants worked on it.
      onClose: ({ event }) => {
        if (event.reason === BOARD_NOT_FOUND) {
          setStatus('not-found')
          provider.disconnect()
        } else if (event.reason === PERMISSION_DENIED) {
          // The access ended, or the token could not be renewed in time: a new connection finds out which.
          provider.disconnect()
          setStatus('connecting')
          setAttempt((current) => current + 1)
        }
      },
      // Another participant renamed or deleted the board or changed the access to it: it comes from the API again.
      onStateless: ({ payload }) => {
        if (isBoardChanged(payload)) void refreshBoard()
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
  }, [boardId, identity, queryClient, attempt])

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
