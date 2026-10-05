import { Database } from "@hocuspocus/extension-database";
import { Server } from "@hocuspocus/server";
import { accessOnConnect, BOARD_DELETED, createAccessChecks } from "./access.js";
import type { TokenVerifier } from "./auth.js";
import { BoardNotFoundError, type BackendClient } from "./backend-client.js";
import { BOARD_CHANGED, isBoardChanged } from "./messages.js";

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
}

export function createCollabServer({
  port,
  backend,
  verifyToken,
  quiet = false,
  debounce = 2_000,
  maxDebounce = 10_000,
  stopOnSignals = true,
  accessCheckInterval = 60_000,
}: CollabServerOptions): Server {
  const checkAccess = createAccessChecks(backend);
  let accessChecks: NodeJS.Timeout | undefined;
  return new Server({
    port,
    quiet,
    stopOnSignals,
    debounce,
    maxDebounce,
    // Store pending changes as soon as the last participant leaves.
    unloadImmediately: true,
    extensions: [
      new Database({
        // Every document is a board; its name is the board id.
        // Throwing here makes Hocuspocus close the connection and report the error reason to the client.
        async fetch({ documentName }) {
          return backend.loadDocument(documentName);
        },
        async store({ documentName, state, document }) {
          try {
            await backend.storeDocument(documentName, state);
          } catch (error) {
            if (error instanceof BoardNotFoundError) {
              // The board was deleted: its participants are told so, and its changes are dropped.
              document.getConnections().forEach((connection) => connection.close(BOARD_DELETED));
              return;
            }
            console.error(`Failed to store board ${documentName}`, error);
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
      // Any other name is not a board; the backend is not asked about it.
      if (!canonicalUuid.test(documentName)) {
        throw new BoardNotFoundError(documentName);
      }
      const user = await verifyToken(token, documentName);
      const access = await accessOnConnect(backend, documentName, user.id);
      connectionConfig.readOnly = access === "view";
      return { user, access };
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
    },
  });
}
