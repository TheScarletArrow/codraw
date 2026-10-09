import { HocuspocusProvider } from '@hocuspocus/provider'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { fetchCollabToken } from '../api/boards.ts'
import { isForbidden, isNotFound, isUnauthorized } from '../api/http.ts'
import { recheckSession } from '../auth/session.ts'
import type { ParticipantIdentity } from './identity.ts'
import { threadsKey } from '../comments/threads.ts'
import { decisionsKey } from '../decisions/decisions.ts'
import { getPages } from '../diagram/model.ts'
import { embedKey } from '../embed/links.ts'
import { hasUnsentEdits, localCopiesAvailable, openLocalCopy, setUnsentEdits } from '../offline/localCopies.ts'
import { membersKey } from './members.ts'
import { proposalsKey } from '../proposals/proposals.ts'
import { BOARD_CHANGED, changeOf, COMMENTS_CHANGED, DECISIONS_CHANGED, PROPOSALS_CHANGED } from './messages.ts'
import { participantPage, type Awareness } from './presence.ts'

/** `forbidden`: the owner closed the link to the board or removed the participant, who has no access to it any more. */
export type ConnectionStatus = 'connecting' | 'synced' | 'offline' | 'not-found' | 'forbidden'

/**
 * Why the local copy of the board is set aside, so that the page shows the board without its unsent edits: the
 * participant may no longer edit the board, or collab refused the edits because of the size of the board.
 */
export type SetAsideReason = 'no-edit-right' | 'too-large'

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
export const ACCESS_CHANGED = 'access-changed'

/** Reason of collab rejecting a participant whom the board gives no access, e.g. the owner just closed the link. */
export const NO_ACCESS = 'no-access'

/** Reason of collab closing the connection of a participant whose change would make the board larger than allowed. */
export const DOCUMENT_TOO_LARGE = 'document-too-large'

/** WebSocket close code of a message larger than the server takes. */
export const MESSAGE_TOO_BIG = 1009

/** Origin of the changes that the document of the page and the document of the connection pass to each other. */
const RELAY = Symbol('relay')

export function collabUrl(location: Location = window.location) {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/collab`
}

/** The board as the connection needs it: the role that the page fetched, and the title that names its local copy. */
export interface ConnectedBoard {
  id: string
  title: string
  /** The role of the participant lets them only view the board. */
  viewer: boolean
}

/**
 * Connects to the shared document of a board and tracks the connection status and participants.
 *
 * The page works with a document that the local copy of the board for the user keeps in this browser. It is handed
 * out at once when the copy has the board, otherwise once the stored state of the board has arrived; initializing it
 * is up to a participant who may edit the board. The provider syncs a second document with collab: its changes pass
 * to the document of the page always, while the changes of the page pass to it only over a connection that takes them
 * and has synced. So edits made without a connection, also in an earlier tab, go to the board once it accepts them,
 * and never over a read-only connection.
 */
export function useBoardConnection(board: ConnectedBoard, userId: string, identity: ParticipantIdentity) {
  const { id: boardId, viewer } = board
  const queryClient = useQueryClient()
  const viewerRef = useRef(viewer)
  const titleRef = useRef(board.title)
  useEffect(() => {
    viewerRef.current = viewer
    titleRef.current = board.title
  }, [viewer, board.title])
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [participants, setParticipants] = useState<Participant[]>([])
  /**
   * Collab gives every connection the access the board gives when it connects, which the role the page fetched before
   * may not match yet: the page edits only over a connection that accepts changes.
   */
  const [readOnly, setReadOnly] = useState(false)
  /**
   * The board document and the participants' awareness, available once the local copy has loaded the board or the
   * document has been synced.
   */
  const [session, setSession] = useState<{ document: Y.Doc; awareness: Awareness } | null>(null)
  /** Collab refused a change because of the size of the board; the page connects again with a fresh document. */
  const [tooLarge, setTooLarge] = useState(false)
  // A participant who may only view cannot send the edits of their copy: the page shows the board without them.
  const [setAside, setSetAside] = useState<SetAsideReason | null>(() =>
    viewer && hasUnsentEdits(userId, boardId) ? 'no-edit-right' : null,
  )
  /**
   * The document of the page has edits that collab has not taken yet. Every new document of the page, once the copy is
   * set aside or deleted or the page drops a refused change, starts without them.
   */
  const [unsent, setUnsent] = useState(() => !viewer && hasUnsentEdits(userId, boardId))
  // The role gives editing again, e.g. the owner gave it back or answered a request for editing: the copy set aside for
  // want of it goes to the board now, as it would the next time the board is opened. Only a role that comes back counts:
  // a connection may turn out read-only before the page has fetched the narrower role.
  const [wasViewer, setWasViewer] = useState(viewer)
  if (viewer !== wasViewer) {
    setWasViewer(viewer)
    if (!viewer && setAside === 'no-edit-right') {
      setSetAside(null)
      setStatus('connecting')
      setUnsent(hasUnsentEdits(userId, boardId))
    }
  }
  /** The local copy of the board keeps the document of the page. */
  const cached = setAside === null && localCopiesAvailable()
  const [generation, setGeneration] = useState(0)
  const providerRef = useRef<HocuspocusProvider | null>(null)

  useEffect(() => {
    /** The document of the page, kept by the local copy of the board unless the copy is set aside. */
    const document = new Y.Doc()
    /** The document that the provider syncs with collab. */
    const remote = new Y.Doc()
    let copy = setAside ? null : openLocalCopy(userId, boardId, titleRef.current, document)
    let pending = copy !== null && hasUnsentEdits(userId, boardId)
    /** Collab gave the connection the right to edit. */
    let writable = false
    /** The changes of the page pass to collab: the connection may edit and has the state of the board. */
    let sending = false
    /** The page has changes that it held back while they could not pass. */
    let held = false
    /** The board does not exist or gives no access: the page connects no more. */
    let stopped = false
    let disposed = false

    const markUnsent = () => {
      if (pending) return
      pending = true
      setUnsent(true)
      if (copy) setUnsentEdits(userId, boardId, true)
    }
    const markSent = () => {
      if (!pending) return
      pending = false
      setUnsent(false)
      if (copy) setUnsentEdits(userId, boardId, false)
    }
    /** Unsent edits of an earlier tab are in the copy, and count as sent only once it has loaded and passed them on. */
    const unsentInCopy = pending
    // Collab confirmed every change it got, and nothing of the page is held back or still loading from the copy.
    const checkSent = () => {
      const loading = unsentInCopy && copy !== null && !copy.synced
      if (sending && provider.unsyncedChanges === 0 && !loading) markSent()
    }
    const fromCollab = (update: Uint8Array, origin: unknown) => {
      if (origin !== RELAY) Y.applyUpdate(document, update, RELAY)
    }
    const toCollab = (update: Uint8Array, origin: unknown) => {
      if (origin === RELAY) return
      // What the copy loads is in the registry already: it was either sent or marked as unsent.
      if (origin !== copy) markUnsent()
      if (sending) Y.applyUpdate(remote, update, RELAY)
      else held = true
    }
    remote.on('update', fromCollab)
    document.on('update', toCollab)
    const startSending = () => {
      sending = true
      if (held) {
        held = false
        Y.applyUpdate(remote, Y.encodeStateAsUpdate(document, Y.encodeStateVector(remote)), RELAY)
      }
      checkSent()
    }
    const stopSending = () => {
      writable = false
      sending = false
    }
    const releaseCopy = () => {
      void copy?.destroy()
      copy = null
    }
    // The page connects again with a new document, without the edits of the copy.
    const putCopyAside = (reason: SetAsideReason) => {
      setUnsent(false)
      setStatus('connecting')
      setSetAside(reason)
    }

    const refetchBoard = () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['boards', boardId], exact: true }),
        // The owner may have turned the live image on or off, or changed the members.
        queryClient.invalidateQueries({ queryKey: embedKey(boardId), exact: true }),
        queryClient.invalidateQueries({ queryKey: membersKey(boardId), exact: true }),
      ])
    // The board will not appear, nor the access come back, by reconnecting.
    const stop = (final: 'not-found' | 'forbidden') => {
      stopped = true
      stopSending()
      setStatus(final)
      provider.disconnect()
      releaseCopy()
      if (final === 'forbidden') void refetchBoard()
    }
    let handedOut = false
    const handOut = () => {
      if (handedOut || disposed) return
      handedOut = true
      setSession({ document, awareness: provider.awareness! })
    }
    let authenticated = false
    const provider = new HocuspocusProvider({
      url: collabUrl(),
      name: boardId,
      document: remote,
      // Called before every connection, so a reconnect after the previous token has expired gets a new one.
      token: async () => {
        try {
          return (await fetchCollabToken(boardId)).token
        } catch (error) {
          if (isNotFound(error)) stop('not-found')
          else if (isForbidden(error)) stop('forbidden')
          else if (isUnauthorized(error)) void recheckSession(queryClient)
          throw error
        }
      },
      onSynced: ({ state }) => {
        if (!state) return
        handOut()
        setStatus('synced')
        if (writable) startSending()
      },
      onStatus: ({ status }) => {
        if (status === 'disconnected') {
          stopSending()
          setStatus((current) => (current === 'not-found' || current === 'forbidden' ? current : 'offline'))
        }
      },
      // Every connection gets the access the board gives now. A participant who was offline while it changed, e.g.
      // reconnecting after an earlier change, missed the message about it: the board tells their role again. So does
      // a first connection whose access differs from the role the page fetched just before.
      onAuthenticated: ({ scope }) => {
        const connectionReadOnly = scope === 'readonly'
        setReadOnly(connectionReadOnly)
        writable = !connectionReadOnly
        if (authenticated || connectionReadOnly !== viewerRef.current) void refetchBoard()
        authenticated = true
        // The copy has edits that this connection will not take: the page connects again without them.
        if (connectionReadOnly && copy && pending) putCopyAside('no-edit-right')
      },
      onAuthenticationFailed: ({ reason }) => {
        if (reason === BOARD_NOT_FOUND) stop('not-found')
        else if (reason === NO_ACCESS) stop('forbidden')
      },
      // Collab closes the connections of a board that was deleted while participants worked on it, and the connections
      // whose access changed: the provider reconnects then, and the page gets the new role of the participant.
      onClose: ({ event }) => {
        stopSending()
        if (event.reason === BOARD_NOT_FOUND) {
          stop('not-found')
        } else if (event.reason === ACCESS_CHANGED) {
          void refetchBoard()
        } else if (event.reason === DOCUMENT_TOO_LARGE || event.code === MESSAGE_TOO_BIG) {
          // The document has a change that collab never takes, and the page would send it again on every
          // reconnection: the page drops the document and gets the board as collab has it. The copy keeps the change,
          // and the edits made without a connection along with it, until the participant downloads or deletes it.
          setTooLarge(true)
          if (copy && pending) {
            putCopyAside('too-large')
          } else {
            setUnsent(false)
            setStatus('connecting')
            setGeneration((current) => current + 1)
          }
        }
      },
      onUnsyncedChanges: () => checkSent(),
      // Another participant renamed or deleted the board: its title, or its absence, comes from the API. So do the
      // comments, the decisions and the proposals that another participant changed.
      onStateless: ({ payload }) => {
        const change = changeOf(payload)
        if (change === 'board-changed') void refetchBoard()
        else if (change === 'comments-changed') void queryClient.invalidateQueries({ queryKey: threadsKey(boardId) })
        else if (change === 'decisions-changed') {
          // The discussion of a deleted decision goes away with it.
          void queryClient.invalidateQueries({ queryKey: decisionsKey(boardId) })
          void queryClient.invalidateQueries({ queryKey: threadsKey(boardId) })
        } else if (change === 'proposals-changed') void queryClient.invalidateQueries({ queryKey: proposalsKey(boardId) })
      },
    })
    providerRef.current = provider

    // The board that the copy has shows at once. An empty copy, e.g. of a board opened the first time, waits for
    // collab: a participant who may edit would otherwise set up a first page of their own before the board's arrived.
    const opened = copy
    void opened?.whenSynced.then(() => {
      if (disposed || opened !== copy) return
      if (getPages(document).size > 0) handOut()
      checkSent()
    })

    // The provider notices a lost network only after half a minute of silence, and a socket may stay open meanwhile:
    // the browser tells sooner. The socket closes, and the provider tries again as after any lost socket, in case the
    // browser is wrong. Once the network is back, the page connects at once rather than after the pause between
    // attempts.
    const goOffline = () => {
      stopSending()
      setStatus((current) => (current === 'not-found' || current === 'forbidden' ? current : 'offline'))
      provider.configuration.websocketProvider.webSocket?.close()
    }
    const goOnline = () => {
      if (!stopped) void provider.connect()
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    if (!navigator.onLine) goOffline()

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
      disposed = true
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
      awareness.off('change', updateParticipants)
      remote.off('update', fromCollab)
      document.off('update', toCollab)
      setSession(null)
      setReadOnly(false)
      providerRef.current = null
      provider.destroy()
      releaseCopy()
      remote.destroy()
      document.destroy()
    }
  }, [boardId, userId, identity, queryClient, generation, setAside])

  /** Tells the other participants that the board changed, e.g. its title, so that they fetch it again. */
  const notifyBoardChanged = useCallback(() => providerRef.current?.sendStateless(BOARD_CHANGED), [])

  /** Tells the other participants that the comments changed, so that they fetch them again. */
  const notifyCommentsChanged = useCallback(() => providerRef.current?.sendStateless(COMMENTS_CHANGED), [])

  /** Tells the other participants that the decisions changed, so that they fetch them again. */
  const notifyDecisionsChanged = useCallback(() => providerRef.current?.sendStateless(DECISIONS_CHANGED), [])

  /** Tells the other participants that a proposal was made or decided, so that they fetch the proposals again. */
  const notifyProposalsChanged = useCallback(() => providerRef.current?.sendStateless(PROPOSALS_CHANGED), [])

  const dismissTooLarge = useCallback(() => setTooLarge(false), [])

  /** The set-aside copy was deleted: the page connects again and keeps the board in a new copy. */
  const copyDeleted = useCallback(() => {
    setUnsent(false)
    setStatus('connecting')
    setSetAside(null)
  }, [])

  return {
    status,
    readOnly,
    tooLarge,
    dismissTooLarge,
    cached,
    unsent,
    setAside,
    copyDeleted,
    participants,
    document: session?.document ?? null,
    awareness: session?.awareness ?? null,
    notifyBoardChanged,
    notifyCommentsChanged,
    notifyDecisionsChanged,
    notifyProposalsChanged,
  }
}
