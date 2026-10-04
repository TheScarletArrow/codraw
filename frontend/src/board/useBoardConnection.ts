import { HocuspocusProvider } from '@hocuspocus/provider'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import { fetchCollabToken } from '../api/boards.ts'
import { isNotFound, isUnauthorized } from '../api/http.ts'
import { recheckSession } from '../auth/session.ts'
import { initializeDocument } from '../diagram/model.ts'
import type { ParticipantIdentity } from './identity.ts'
import { participantPage, type Awareness } from './presence.ts'

export type ConnectionStatus = 'connecting' | 'synced' | 'offline' | 'not-found'

export interface Participant extends ParticipantIdentity {
  clientId: number
  isSelf: boolean
  /** The page the participant works on. */
  page: string
}

/** Reason that collab sends when the board does not exist. */
const BOARD_NOT_FOUND = 'board-not-found'

export function collabUrl(location: Location = window.location) {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/collab`
}

/** Connects to the shared document of a board and tracks the connection status and participants. */
export function useBoardConnection(boardId: string, identity: ParticipantIdentity) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [participants, setParticipants] = useState<Participant[]>([])
  /** The board document and the participants' awareness, available once the document has been synced. */
  const [session, setSession] = useState<{ document: Y.Doc; awareness: Awareness } | null>(null)

  useEffect(() => {
    const document = new Y.Doc()
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
    })

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
      provider.destroy()
      document.destroy()
    }
  }, [boardId, identity, queryClient])

  return { status, participants, document: session?.document ?? null, awareness: session?.awareness ?? null }
}
