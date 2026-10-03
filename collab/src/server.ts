import { Database } from "@hocuspocus/extension-database";
import { Server } from "@hocuspocus/server";
import { BoardNotFoundError, type BackendClient } from "./backend-client.js";

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CollabServerOptions {
  port: number;
  backend: BackendClient;
  quiet?: boolean;
  /** Delay after the last change before the document is stored, in milliseconds. */
  debounce?: number;
  /** Upper bound for postponing a store while changes keep coming, in milliseconds. */
  maxDebounce?: number;
  /** Store pending changes and exit on SIGINT, SIGQUIT and SIGTERM. */
  stopOnSignals?: boolean;
}

export function createCollabServer({
  port,
  backend,
  quiet = false,
  debounce = 2_000,
  maxDebounce = 10_000,
  stopOnSignals = true,
}: CollabServerOptions): Server {
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
          if (!canonicalUuid.test(documentName)) {
            throw new BoardNotFoundError(documentName);
          }
          return backend.loadDocument(documentName);
        },
        async store({ documentName, state }) {
          try {
            await backend.storeDocument(documentName, state);
          } catch (error) {
            console.error(`Failed to store board ${documentName}`, error);
            throw error;
          }
        },
      }),
    ],
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
