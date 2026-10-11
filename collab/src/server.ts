import { Server, type Connection, type Document } from "@hocuspocus/server";
import * as Y from "yjs";
import {
  accessOnConnect,
  BOARD_DELETED,
  createAccessChecks,
  PROPOSAL_DELETED,
  type ConnectionContext,
} from "./access.js";
import type { TokenVerifier } from "./auth.js";
import { checkUserOnConnect, createUserChecks } from "./users.js";
import { BoardNotFoundError, type BackendClient } from "./backend-client.js";
import { documentOf, type CollabDocument } from "./documents.js";
import { createDocumentEditors } from "./editors.js";
import { log } from "./log.js";
import {
  BOARD_CHANGED,
  changeOf,
  COMMENTS_CHANGED,
  DECISIONS_CHANGED,
  ISSUES_CHANGED,
  PROPOSALS_CHANGED,
} from "./messages.js";
import { createMetrics, rejectionReasonOf, type Metrics } from "./metrics.js";
import { createSearchTextBackfill } from "./search-text-backfill.js";
import { createDocumentSizes, DOCUMENT_SIZE_LIMIT, DocumentTooLargeError } from "./size.js";
import type { Snapshots } from "./snapshots.js";

export interface CollabServerOptions {
  port: number;
  backend: BackendClient;
  /** Where the open documents are mirrored and stored, outside the main thread; the server destroys it with itself. */
  snapshots: Snapshots;
  verifyToken: TokenVerifier;
  quiet?: boolean;
  /** Delay after the last change before the document is stored, in milliseconds. */
  debounce?: number;
  /** Upper bound for postponing a store while changes keep coming, in milliseconds. */
  maxDebounce?: number;
  /** Store pending changes and exit on SIGINT, SIGQUIT and SIGTERM. */
  stopOnSignals?: boolean;
  /**
   * Period of checking the connections of open documents against the current access to their boards, in milliseconds.
   * It bounds how long a change of access that no participant told collab about takes to reach the connections.
   */
  accessCheckInterval?: number;
  /** The largest a board document may grow, in bytes; changes that only delete pass beyond it. */
  documentSizeLimit?: number;
  /**
   * How long the changes and cursor moves of a document gather before they go to its participants in one message, in
   * milliseconds. 0 sends what arrived in one turn of the event loop together and adds no delay. On a board of many
   * participants every cursor move goes to all of them: a delay of a few tens of milliseconds sends fewer, larger
   * messages and halves the processor time of collab there, at the cost of that delay for every change
   * (docs/load-testing.md).
   */
  broadcastDelay?: number;
  /** Where the server counts what it does; `GET /metrics` gives them in the Prometheus format. */
  metrics?: Metrics;
  /**
   * Period of filling in the texts for search of boards that have none, in milliseconds; the first pass starts when the
   * server listens. `null` turns filling in off.
   */
  searchTextBackfillInterval?: number | null;
  /**
   * Period of closing the connections of users whom an administrator blocked or whose accounts are gone, in
   * milliseconds; it bounds how long such a user keeps working.
   */
  userCheckInterval?: number;
}

/** The largest awareness state of one client, in characters of its JSON. */
const AWARENESS_STATE_LIMIT = 32 * 1024;

/** As PARTICIPANT_COLORS and participantColor() in frontend/src/board/identity.ts. */
const PARTICIPANT_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#4d7c0f"];

/** How the user appears to the others, as participantIdentity() of the frontend makes it. */
function participantOf(user: { id: string; name: string; avatar?: string }) {
  let hash = 0;
  for (const char of user.id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return { name: user.name, color: PARTICIPANT_COLORS[Math.abs(hash) % PARTICIPANT_COLORS.length], avatarUrl: user.avatar ?? null };
}

/** Room for the framing of a message around the largest change. */
const MESSAGE_OVERHEAD = 64 * 1024;

/** Sync messages that change the document: y-protocols SyncStep2 and Update. */
const SYNC_STEP_2 = 1;
const SYNC_UPDATE = 2;

export function createCollabServer({
  port,
  backend,
  snapshots,
  verifyToken,
  quiet = false,
  debounce = 2_000,
  maxDebounce = 10_000,
  stopOnSignals = true,
  accessCheckInterval = 60_000,
  documentSizeLimit = DOCUMENT_SIZE_LIMIT,
  broadcastDelay = 0,
  metrics = createMetrics(),
  searchTextBackfillInterval = 60 * 60_000,
  userCheckInterval = 10_000,
}: CollabServerOptions): Server {
  const checkAccess = createAccessChecks(backend, metrics);
  const checkUsers = createUserChecks(backend, metrics);
  const sizes = createDocumentSizes(documentSizeLimit);
  const editors = createDocumentEditors();
  let accessChecks: NodeJS.Timeout | undefined;
  /** The awareness client id each connection speaks for. */
  const awarenessClients = new WeakMap<object, number>();
  /** Whether a connection of another user speaks for the client; the same user takes it over, e.g. after a reconnect. */
  const claimedByOther = (document: Document, connection: Connection, clientId: number) => {
    const userId = (connection.context as ConnectionContext).user.id;
    return [...document.connections].some(
      ([other, { clients }]) =>
        other !== connection &&
        (other.context as ConnectionContext).user.id !== userId &&
        (clients.has(clientId) || awarenessClients.get(other) === clientId),
    );
  };
  let userChecks: NodeJS.Timeout | undefined;
  let backfills: NodeJS.Timeout | undefined;
  const backfill = createSearchTextBackfill(backend, metrics, snapshots);
  const fillInSearchTexts = () =>
    void backfill.run().catch((error: unknown) => log.error("Failed to fill in the texts of boards", error));
  /** The board or the draft that an open document is; authentication lets no other name through. */
  const targetOf = (documentName: string): CollabDocument => {
    const target = documentOf(documentName);
    if (!target) throw new BoardNotFoundError(documentName);
    return target;
  };
  return new Server({
    port,
    quiet,
    stopOnSignals,
    debounce,
    maxDebounce,
    // Store pending changes as soon as the last participant leaves.
    unloadImmediately: true,
    flushDelay: broadcastDelay,
    // A message that cannot fit into a document is refused before it is read into memory: ws closes with 1009.
    websocketOptions: { maxPayload: documentSizeLimit + MESSAGE_OVERHEAD },
    extensions: [
      {
        // A document is a board, named by its id, or the draft of a proposal, `proposal:<id>`. Its mirror in the
        // snapshot worker starts from the same state, and gets every change from here on: the listener is added right
        // after the state is applied, with nothing awaited in between.
        // Throwing here makes Hocuspocus close the connection and report the error reason to the client.
        async onLoadDocument({ documentName, document }) {
          const target = targetOf(documentName);
          const state = target.kind === "board" ? await backend.loadDocument(target.id) : await backend.loadDraft(target.id);
          sizes.set(documentName, state?.length ?? 0);
          if (state) Y.applyUpdate(document, state);
          // Last use of the state here: its bytes move to the worker.
          snapshots.open(documentName, state);
          document.on("update", (update: Uint8Array) => snapshots.update(documentName, update));
        },
        // The snapshot worker encodes and sends the state; here only what follows from how the store ended.
        async onStoreDocument(payload) {
          const { documentName, document, instance } = payload;
          const target = targetOf(documentName);
          // Taken before anything is awaited, when the store is asked for: the state that the worker encodes has
          // exactly the changes applied before, and those are theirs. A draft has nobody to name.
          const changedBy = editors.take(documentName);
          const mark = sizes.storing(documentName);
          const { result, seconds, size, searchText, error } = await snapshots.store(
            documentName,
            target,
            changedBy,
            document,
          );
          if (size !== null) sizes.stored(documentName, size, mark);
          metrics.stored(result, seconds);
          switch (result) {
            case "board_deleted":
              // The board was deleted: its participants are told so, and its changes are dropped.
              document.getConnections().forEach((connection) => connection.close(BOARD_DELETED));
              return;
            // A closed proposal keeps its draft as it is: the changes are dropped, and the connections are checked, so
            // that its author views it from now on.
            case "proposal_closed":
              void checkAccess(document);
              return;
            case "proposal_deleted":
              document.getConnections().forEach((connection) => connection.close(PROPOSAL_DELETED));
              return;
            case "failed":
              // The changes are stored with the next store, and so are the users who made them: Hocuspocus keeps a
              // document whose store throws. It stores it again only after another change, and never when the last
              // participant has left, nor before it stops: the server would wait for it forever. So the store is
              // asked for again, after the debounce delay; a stop runs it at once. Hocuspocus starts it once this
              // one has ended.
              editors.giveBack(documentName, changedBy);
              void instance.storeDocumentHooks(document, payload);
              if (target.kind === "board") {
                log.error(`Failed to store board ${target.id}`, error, { "codraw.board": target.id });
              } else {
                log.error(`Failed to store the draft of proposal ${target.id}`, error, {
                  "codraw.proposal": target.id,
                });
              }
              throw error ?? new Error(`Failed to store document ${documentName}`);
          }
          // The text went to the backend unless it had it already; a failure leaves the stored state as it is, and the
          // next store sends the text again.
          if (searchText !== null) metrics.searchTextSent(searchText);
          if (searchText === "failed") {
            log.error(`Failed to store the text of board ${target.id}`, error, { "codraw.board": target.id });
          }
        },
      },
    ],
    // Runs before the document is loaded: a rejected client gets neither the document nor the awareness of others.
    // The token tells who the user is, and the backend what the board or the proposal lets them do now. A client that
    // may only view gets a read-only connection: Hocuspocus does not apply its changes, but its cursor and selection
    // still reach the others.
    async onAuthenticate({ token, documentName, connectionConfig }) {
      try {
        // Any other name is neither a board nor a draft; the backend is not asked about it.
        const target = targetOf(documentName);
        const user = await verifyToken(token, target);
        // A token issued before its user was blocked or deleted their account still opens documents for some minutes.
        const [access] = await Promise.all([accessOnConnect(backend, target, user.id), checkUserOnConnect(backend, user.id)]);
        connectionConfig.readOnly = access === "view";
        return { user, access };
      } catch (error) {
        metrics.rejected(rejectionReasonOf(error));
        throw error;
      }
    },
    // A change that would make the document larger than the limit is not applied: Hocuspocus closes the connection of
    // its participant to the document with the reason of the error. Read-only connections change nothing.
    async beforeSync({ type, payload, documentName, document, connection }) {
      if ((type !== SYNC_STEP_2 && type !== SYNC_UPDATE) || connection.readOnly) return;
      try {
        sizes.accept(documentName, document, payload);
      } catch (error) {
        if (error instanceof DocumentTooLargeError) metrics.rejected("document-too-large");
        throw error;
      }
    },
    // Who changed the document of a board goes to the backend with its next store. Hocuspocus calls this for every
    // change it applies, before the store that the change schedules; read-only connections change nothing, so viewers
    // are never among them. A draft has no versions to name them in.
    async onChange({ documentName, context }) {
      const user = (context as Partial<ConnectionContext>).user;
      if (user && documentOf(documentName)?.kind === "board") editors.add(documentName, user.id);
    },
    async afterUnloadDocument({ documentName }) {
      sizes.forget(documentName);
      editors.forget(documentName);
      snapshots.close(documentName);
    },
    // A connection speaks for the one client id it announced first, which no other connection has; its user is the one
    // of its token, and a state stays small. Anything else in an update is dropped: the update of Hocuspocus also holds
    // an empty state of a client of its own, which the others ignore anyway.
    async beforeHandleAwareness({ states, connection, document }) {
      if (!connection) return;
      const context = connection.context as ConnectionContext;
      for (const [clientId, state] of states) {
        let mine = awarenessClients.get(connection);
        if (mine === undefined && Object.keys(state).length > 0 && !claimedByOther(document, connection, clientId)) {
          awarenessClients.set(connection, (mine = clientId));
        }
        if (clientId !== mine) {
          states.delete(clientId);
          continue;
        }
        // A selection too large for the others goes first, so that the cursor and the rest stay.
        if ("selection" in state && JSON.stringify(state).length > AWARENESS_STATE_LIMIT) state.selection = [];
        if (JSON.stringify(state).length > AWARENESS_STATE_LIMIT) states.delete(clientId);
        else if ("user" in state) state.user = participantOf(context.user);
      }
    },
    // A participant changed the board, its comments, its decisions, its linked issues or its proposals; the others fetch
    // them again. Only these messages pass, written by collab itself. A change of the board may be of the access to it,
    // and a change of a proposal in its draft closes it or not, so the connections are checked too. Viewers comment,
    // link issues to threads and propose as well, and those who review a draft view it, so comments-changed,
    // issues-changed and proposals-changed pass from read-only connections.
    async onStateless({ payload, document, connection }) {
      const change = changeOf(payload);
      if (change === "board-changed") {
        // Only those who may edit change the board or the access to it; a viewer would make everybody fetch it.
        if (connection.readOnly) return;
        document.broadcastStateless(BOARD_CHANGED, (other) => other !== connection);
        void checkAccess(document);
      } else if (change === "comments-changed") {
        document.broadcastStateless(COMMENTS_CHANGED, (other) => other !== connection);
      } else if (change === "decisions-changed" && !connection.readOnly) {
        document.broadcastStateless(DECISIONS_CHANGED, (other) => other !== connection);
      } else if (change === "issues-changed") {
        document.broadcastStateless(ISSUES_CHANGED, (other) => other !== connection);
      } else if (change === "proposals-changed") {
        document.broadcastStateless(PROPOSALS_CHANGED, (other) => other !== connection);
        if (documentOf(document.name)?.kind === "proposal") void checkAccess(document);
      }
    },
    // Participants tell collab about changes of access, but the owner may change it without the board open, and such a
    // message may be lost: open documents are checked from time to time as well. The users of all connections, who may
    // have deleted their accounts or been blocked, are checked more often. Boards without a text for search get theirs
    // at the start and then from time to time.
    async onListen({ instance: hocuspocus }) {
      metrics.observe(hocuspocus);
      accessChecks = setInterval(
        () => hocuspocus.documents.forEach((document) => void checkAccess(document)),
        accessCheckInterval,
      );
      accessChecks.unref();
      userChecks = setInterval(() => void checkUsers(hocuspocus), userCheckInterval);
      userChecks.unref();
      if (searchTextBackfillInterval !== null) {
        fillInSearchTexts();
        backfills = setInterval(fillInSearchTexts, searchTextBackfillInterval);
        backfills.unref();
      }
    },
    async onDestroy() {
      clearInterval(accessChecks);
      clearInterval(userChecks);
      clearInterval(backfills);
      backfill.stop();
      // Hocuspocus calls this once every document was stored and unloaded.
      await snapshots.destroy();
    },
    async onRequest({ request, response }) {
      if (request.method === "GET" && request.url === "/health") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ status: "UP" }));
        // Hocuspocus stops its default HTTP handling when the hook rejects without an error.
        return Promise.reject();
      }
      // Not reachable through the app address: nginx proxies only /collab here.
      if (request.method === "GET" && request.url === "/metrics") {
        response.writeHead(200, { "Content-Type": metrics.registry.contentType });
        response.end(await metrics.registry.metrics());
        return Promise.reject();
      }
    },
  });
}
