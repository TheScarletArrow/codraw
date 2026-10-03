import { HocuspocusProvider } from '@hocuspocus/provider'
import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { ParticipantIdentity } from './guest.ts'

export type ConnectionStatus = 'connecting' | 'synced' | 'offline' | 'not-found'

export interface Participant extends ParticipantIdentity {
  clientId: number
  isSelf: boolean
}

/** Reason that collab sends when the board does not exist. */
const BOARD_NOT_FOUND = 'board-not-found'

export function collabUrl(location: Location = window.location) {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/collab`
}

/** Connects to the shared document of a board and tracks the connection status and participants. */
export function useBoardConnection(boardId: string, identity: ParticipantIdentity) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [participants, setParticipants] = useState<Participant[]>([])

  useEffect(() => {
    const document = new Y.Doc()
    const provider = new HocuspocusProvider({
      url: collabUrl(),
      name: boardId,
      document,
      onSynced: ({ state }) => {
        if (state) setStatus('synced')
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
          list.push({ clientId, name: user.name, color: user.color, isSelf: clientId === awareness.clientID })
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
      provider.destroy()
      document.destroy()
    }
  }, [boardId, identity])

  return { status, participants }
}
