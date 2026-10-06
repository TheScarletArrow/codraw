import { HocuspocusProvider } from '@hocuspocus/provider'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { isForbidden, isNotFound, isUnauthorized } from '../api/http.ts'
import { fetchProposalToken } from '../api/proposals.ts'
import { recheckSession } from '../auth/session.ts'
import { changeOf, PROPOSALS_CHANGED } from '../board/messages.ts'
import {
  ACCESS_CHANGED,
  collabUrl,
  DOCUMENT_TOO_LARGE,
  MESSAGE_TOO_BIG,
  NO_ACCESS,
  type ConnectionStatus,
} from '../board/useBoardConnection.ts'
import { DRAFT_DOCUMENT_PREFIX, proposalsKey } from './proposals.ts'

/** Reason that collab sends when the proposal of a draft does not exist, also when it closes the connections to it. */
const PROPOSAL_NOT_FOUND = 'proposal-not-found'

/**
 * Connects to the draft of a proposal of changes in collab and tracks the connection: the document of the draft once
 * it has synced, and whether the connection takes changes. Collab decides that: the author edits an open proposal, the
 * owner and the editors of the board view it, and everybody views a closed one.
 *
 * Unlike a board, a draft has no copy on the device: the page works with the document of the provider, which keeps
 * the changes made without a connection while the tab is open and sends them once it is back. A connection that turns
 * out read-only while the document has changes collab has not taken, e.g. after the proposal was closed meanwhile,
 * starts again with the draft as collab has it.
 */
export function useDraftConnection(boardId: string, proposalId: string) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [readOnly, setReadOnly] = useState(true)
  const [document, setDocument] = useState<Y.Doc | null>(null)
  /** Collab refused a change because of the size of the draft; the page connects again with a fresh document. */
  const [tooLarge, setTooLarge] = useState(false)
  const [generation, setGeneration] = useState(0)
  const providerRef = useRef<HocuspocusProvider | null>(null)

  useEffect(() => {
    const doc = new Y.Doc()
    let disposed = false
    /** The page changed the document, and collab has not confirmed the changes yet. */
    let pending = false
    const changed = (_update: Uint8Array, origin: unknown) => {
      // The provider applies what collab sends with itself as the origin.
      if (origin !== provider) pending = true
    }
    // The status, or the proposal of the draft, may have changed: e.g. it was accepted, and its author views it now.
    const refetchProposal = () => queryClient.invalidateQueries({ queryKey: proposalsKey(boardId) })
    // The proposal will not appear, nor the access come back, by reconnecting.
    const stop = (final: 'not-found' | 'forbidden') => {
      setStatus(final)
      provider.disconnect()
    }
    const startAgain = () => {
      setStatus('connecting')
      setGeneration((current) => current + 1)
    }
    const provider = new HocuspocusProvider({
      url: collabUrl(),
      name: `${DRAFT_DOCUMENT_PREFIX}${proposalId}`,
      document: doc,
      // Called before every connection, so a reconnect after the previous token has expired gets a new one.
      token: async () => {
        try {
          return (await fetchProposalToken(boardId, proposalId)).token
        } catch (error) {
          if (isNotFound(error)) stop('not-found')
          else if (isForbidden(error)) stop('forbidden')
          else if (isUnauthorized(error)) void recheckSession(queryClient)
          throw error
        }
      },
      onSynced: ({ state }) => {
        if (!state || disposed) return
        setDocument(doc)
        setStatus('synced')
      },
      onStatus: ({ status }) => {
        if (status === 'disconnected') {
          setStatus((current) => (current === 'not-found' || current === 'forbidden' ? current : 'offline'))
        }
      },
      onAuthenticated: ({ scope }) => {
        const connectionReadOnly = scope === 'readonly'
        if (connectionReadOnly && pending) {
          startAgain()
          return
        }
        setReadOnly(connectionReadOnly)
      },
      onUnsyncedChanges: ({ number }) => {
        if (number === 0) pending = false
      },
      onAuthenticationFailed: ({ reason }) => {
        if (reason === PROPOSAL_NOT_FOUND) stop('not-found')
        else if (reason === NO_ACCESS) stop('forbidden')
      },
      onClose: ({ event }) => {
        if (event.reason === PROPOSAL_NOT_FOUND) {
          stop('not-found')
        } else if (event.reason === ACCESS_CHANGED) {
          void refetchProposal()
        } else if (event.reason === DOCUMENT_TOO_LARGE || event.code === MESSAGE_TOO_BIG) {
          // The document has a change that collab never takes, and the page would send it again on every reconnection.
          setTooLarge(true)
          startAgain()
        }
      },
      onStateless: ({ payload }) => {
        if (changeOf(payload) === 'proposals-changed') void refetchProposal()
      },
    })
    providerRef.current = provider
    doc.on('update', changed)
    return () => {
      disposed = true
      doc.off('update', changed)
      setDocument(null)
      setReadOnly(true)
      providerRef.current = null
      provider.destroy()
      doc.destroy()
    }
  }, [boardId, proposalId, queryClient, generation])

  /** Tells the others on the draft that the proposal changed, e.g. was withdrawn, so that they fetch it again. */
  const notifyProposalsChanged = useCallback(() => providerRef.current?.sendStateless(PROPOSALS_CHANGED), [])

  const dismissTooLarge = useCallback(() => setTooLarge(false), [])

  return { status, readOnly, document, tooLarge, dismissTooLarge, notifyProposalsChanged }
}
