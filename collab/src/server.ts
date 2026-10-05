import { Database } from "@hocuspocus/extension-database";
import { Server } from "@hocuspocus/server";
import { accessOnConnect, BOARD_DELETED, createAccessChecks } from "./access.js";
import type { TokenVerifier } from "./auth.js";
import { BoardNotFoundError, type BackendClient } from "./backend-client.js";
import { log } from "./log.js";
import { BOARD_CHANGED, isBoardChanged } from "./messages.js";
import { createMetrics, rejectionReasonOf, type Metrics } from "./metrics.js";
import { createDocumentSizes, DOCUMENT_SIZE_LIMIT, DocumentTooLargeError } from "./size.js";

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
}: CollabServerOptions): Server {
  const checkAccess = createAccessChecks(backend, metrics);
  const sizes = createDocumentSizes(documentSizeLimit);
  let accessChecks: NodeJS.Timeout | undefined;
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
        // Every document is a board; its name is the board id.
        // Throwing here makes Hocuspocus close the connection and report the error reason to the client.
        async fetch({ documentName }) {
          const state = await backend.loadDocument(documentName);
          sizes.set(documentName, state?.length ?? 0);
          return state;
        },
        async store({ documentName, state, document }) {
          sizes.set(documentName, state.length);
          const started = performance.now();
          const seconds = () => (performance.now() - started) / 1000;
          try {
            await backend.storeDocument(documentName, state);
            metrics.stored("stored", seconds());
          } catch (error) {
            if (error instanceof BoardNotFoundError) {
              metrics.stored("board_deleted", seconds());
              // The board was deleted: its participants are told so, and its changes are dropped.
              document.getConnections().forEach((connection) => connection.close(BOARD_DELETED));
              return;
            }
            metrics.stored("failed", seconds());
            log.error(`Failed to store board ${documentName}`, error, { "codraw.board": documentName });
            throw error;
          }
        },
      }),
    ],
    // Runs before the document is loaded: a rejected client gets neither the document nor the awareness of others.
    // The token tells who the user is, and the backend what the board lets them do now. A client that may only view
    // gets a read-only connection: Hocuspocus does not apply its changes, but its cursor and selection still reach the
    // others.
    async onAuthenticate({ token, documentName, connectionConfig }) {
      try {
        // Any other name is not a board; the backend is not asked about it.
        if (!canonicalUuid.test(documentName)) {
          throw new BoardNotFoundError(documentName);
        }
        const user = await verifyToken(token, documentName);
        const access = await accessOnConnect(backend, documentName, user.id);
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
    async afterUnloadDocument({ documentName }) {
      sizes.forget(documentName);
    },
    // A participant changed the board; the others fetch it again. Only this message passes, written by collab itself.
    // The change may be of the access to the board, so the connections are checked against it too.
    async onStateless({ payload, document, connection }) {
      if (!isBoardChanged(payload)) return;
      document.broadcastStateless(BOARD_CHANGED, (other) => other !== connection);
      void checkAccess(document);
    },
    // Participants tell collab about changes of access, but the owner may change it without the board open, and such a
    // message may be lost: open documents are checked from time to time as well.
    async onListen({ instance }) {
      metrics.observe(instance);
      accessChecks = setInterval(
        () => instance.documents.forEach((document) => void checkAccess(document)),
        accessCheckInterval,
      );
      accessChecks.unref();
    },
    async onDestroy() {
      clearInterval(accessChecks);
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
