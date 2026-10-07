import { Database } from "@hocuspocus/extension-database";
import { Server, type Document } from "@hocuspocus/server";
import {
  accessOnConnect,
  BOARD_DELETED,
  createAccessChecks,
  PROPOSAL_DELETED,
  type ConnectionContext,
} from "./access.js";
import type { TokenVerifier } from "./auth.js";
import {
  BoardNotFoundError,
  ProposalClosedError,
  ProposalNotFoundError,
  type BackendClient,
} from "./backend-client.js";
import { documentOf, type CollabDocument } from "./documents.js";
import { createDocumentEditors } from "./editors.js";
import { log } from "./log.js";
import { BOARD_CHANGED, changeOf, COMMENTS_CHANGED, PROPOSALS_CHANGED } from "./messages.js";
import { createMetrics, rejectionReasonOf, type Metrics } from "./metrics.js";
import { createSearchTextBackfill } from "./search-text-backfill.js";
import { searchTextOf } from "./search-text.js";
import { createDocumentSizes, DOCUMENT_SIZE_LIMIT, DocumentTooLargeError } from "./size.js";

export interface CollabServerOptions {
  port: number;
  backend: BackendClient;
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
  /** Where the server counts what it does; `GET /metrics` gives them in the Prometheus format. */
  metrics?: Metrics;
  /**
   * Period of filling in the texts for search of boards that have none, in milliseconds; the first pass starts when the
   * server listens. `null` turns filling in off.
   */
  searchTextBackfillInterval?: number | null;
}

/** Room for the framing of a message around the largest change. */
const MESSAGE_OVERHEAD = 64 * 1024;

/** Sync messages that change the document: y-protocols SyncStep2 and Update. */
const SYNC_STEP_2 = 1;
const SYNC_UPDATE = 2;

export function createCollabServer({
  port,
  backend,
  verifyToken,
  quiet = false,
  debounce = 2_000,
  maxDebounce = 10_000,
  stopOnSignals = true,
  accessCheckInterval = 60_000,
  documentSizeLimit = DOCUMENT_SIZE_LIMIT,
  metrics = createMetrics(),
  searchTextBackfillInterval = 60 * 60_000,
}: CollabServerOptions): Server {
  const checkAccess = createAccessChecks(backend, metrics);
  const sizes = createDocumentSizes(documentSizeLimit);
  const editors = createDocumentEditors();
  /** The text for search that the backend has of each open board, as collab sent it last. */
  const searchTexts = new Map<string, string>();
  let accessChecks: NodeJS.Timeout | undefined;
  let backfills: NodeJS.Timeout | undefined;
  let instance: Server["hocuspocus"] | undefined;
  const backfill = createSearchTextBackfill(backend, metrics, (boardId) => instance?.documents.get(boardId));
  const fillInSearchTexts = () =>
    void backfill.run().catch((error: unknown) => log.error("Failed to fill in the texts of boards", error));
  /** The board or the draft that an open document is; authentication lets no other name through. */
  const targetOf = (documentName: string): CollabDocument => {
    const target = documentOf(documentName);
    if (!target) throw new BoardNotFoundError(documentName);
    return target;
  };
  /**
   * Stores a draft. A closed proposal keeps its draft as it is: the changes are dropped, and the connections are checked,
   * so that its author views it from now on. The connections of a deleted proposal are closed.
   */
  const storeDraft = async (proposalId: string, state: Uint8Array, document: Document) => {
    const started = performance.now();
    const seconds = () => (performance.now() - started) / 1000;
    try {
      await backend.storeDraft(proposalId, state);
      metrics.stored("stored", seconds());
    } catch (error) {
      if (error instanceof ProposalClosedError) {
        metrics.stored("proposal_closed", seconds());
        void checkAccess(document);
        return;
      }
      if (error instanceof ProposalNotFoundError) {
        metrics.stored("proposal_deleted", seconds());
        document.getConnections().forEach((connection) => connection.close(PROPOSAL_DELETED));
        return;
      }
      metrics.stored("failed", seconds());
      log.error(`Failed to store the draft of proposal ${proposalId}`, error, { "codraw.proposal": proposalId });
      throw error;
    }
  };
  /**
   * Sends the text of a stored board document for search, unless the backend has it already. A failure leaves the
   * stored state as it is: the next store sends the text again.
   */
  const storeSearchText = async (documentName: string, boardId: string, text: string) => {
    if (searchTexts.get(documentName) === text) return;
    searchTexts.delete(documentName);
    try {
      await backend.storeSearchText(boardId, text);
      searchTexts.set(documentName, text);
      metrics.searchTextSent("stored");
    } catch (error) {
      // The board was deleted right after its state was stored.
      if (error instanceof BoardNotFoundError) return;
      metrics.searchTextSent("failed");
      log.error(`Failed to store the text of board ${boardId}`, error, { "codraw.board": boardId });
    }
  };
  return new Server({
    port,
    quiet,
    stopOnSignals,
    debounce,
    maxDebounce,
    // Store pending changes as soon as the last participant leaves.
    unloadImmediately: true,
    // A message that cannot fit into a document is refused before it is read into memory: ws closes with 1009.
    websocketOptions: { maxPayload: documentSizeLimit + MESSAGE_OVERHEAD },
    extensions: [
      new Database({
        // A document is a board, named by its id, or the draft of a proposal, `proposal:<id>`.
        // Throwing here makes Hocuspocus close the connection and report the error reason to the client.
        async fetch({ documentName }) {
          const target = targetOf(documentName);
          const state = target.kind === "board" ? await backend.loadDocument(target.id) : await backend.loadDraft(target.id);
          sizes.set(documentName, state?.length ?? 0);
          return state;
        },
        async store({ documentName, state, document }) {
          sizes.set(documentName, state.length);
          const target = targetOf(documentName);
          if (target.kind === "proposal") {
            await storeDraft(target.id, state, document);
            return;
          }
          // Taken before anything is awaited, right after the state was encoded: their changes are in it, and the
          // changes in it are theirs. So is the text: it is the text of the state.
          const changedBy = editors.take(documentName);
          const text = searchTextOf(document);
          const started = performance.now();
          const seconds = () => (performance.now() - started) / 1000;
          try {
            await backend.storeDocument(target.id, state, changedBy);
            metrics.stored("stored", seconds());
          } catch (error) {
            if (error instanceof BoardNotFoundError) {
              metrics.stored("board_deleted", seconds());
              // The board was deleted: its participants are told so, and its changes are dropped.
              document.getConnections().forEach((connection) => connection.close(BOARD_DELETED));
              return;
            }
            // The changes are stored with the next store, and so are the users who made them.
            editors.giveBack(documentName, changedBy);
            metrics.stored("failed", seconds());
            log.error(`Failed to store board ${documentName}`, error, { "codraw.board": documentName });
            throw error;
          }
          await storeSearchText(documentName, target.id, text);
        },
      }),
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
        const access = await accessOnConnect(backend, target, user.id);
        connectionConfig.readOnly = access === "view";
        return { user, access };
      } catch (error) {
        metrics.rejected(rejectionReasonOf(error));
        throw error;
      }
    },
    // A change that would make the document larger than the limit is not applied: Hocuspocus closes the connection of
    // its participant to the document with the reason of the error. Read-only connections change nothing.
    async beforeSync({ type, payload, documentName, connection }) {
      if ((type !== SYNC_STEP_2 && type !== SYNC_UPDATE) || connection.readOnly) return;
      try {
        sizes.accept(documentName, payload);
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
      searchTexts.delete(documentName);
    },
    // A participant changed the board, its comments or its proposals; the others fetch them again. Only these messages
    // pass, written by collab itself. A change of the board may be of the access to it, and a change of a proposal in
    // its draft closes it or not, so the connections are checked too. Viewers comment and propose as well, and those who
    // review a draft view it, so comments-changed and proposals-changed pass from read-only connections.
    async onStateless({ payload, document, connection }) {
      const change = changeOf(payload);
      if (change === "board-changed") {
        document.broadcastStateless(BOARD_CHANGED, (other) => other !== connection);
        void checkAccess(document);
      } else if (change === "comments-changed") {
        document.broadcastStateless(COMMENTS_CHANGED, (other) => other !== connection);
      } else if (change === "proposals-changed") {
        document.broadcastStateless(PROPOSALS_CHANGED, (other) => other !== connection);
        if (documentOf(document.name)?.kind === "proposal") void checkAccess(document);
      }
    },
    // Participants tell collab about changes of access, but the owner may change it without the board open, and such a
    // message may be lost: open documents are checked from time to time as well. Boards without a text for search get
    // theirs at the start and then from time to time.
    async onListen({ instance: hocuspocus }) {
      instance = hocuspocus;
      metrics.observe(hocuspocus);
      accessChecks = setInterval(
        () => hocuspocus.documents.forEach((document) => void checkAccess(document)),
        accessCheckInterval,
      );
      accessChecks.unref();
      if (searchTextBackfillInterval !== null) {
        fillInSearchTexts();
        backfills = setInterval(fillInSearchTexts, searchTextBackfillInterval);
        backfills.unref();
      }
    },
    async onDestroy() {
      clearInterval(accessChecks);
      clearInterval(backfills);
      backfill.stop();
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
