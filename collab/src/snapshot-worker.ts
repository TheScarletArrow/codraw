import { parentPort, workerData } from "node:worker_threads";
import * as Y from "yjs";
import {
  BoardNotFoundError,
  createBackendClient,
  ProposalClosedError,
  ProposalNotFoundError,
} from "./backend-client.js";
import type { StoreResult } from "./metrics.js";
import type {
  SerializedError,
  SnapshotReply,
  SnapshotRequest,
  SnapshotWorkerData,
  StoredSearchText,
} from "./snapshot-messages.js";
import { searchTextOf } from "./search-text.js";

/*
 * The snapshot worker: it keeps a mirror of every document open in collab and stores the documents in the backend, so
 * that the main thread, which delivers the changes of all boards, never does work that grows with the size of a
 * document. See snapshots.ts.
 */

const { backendUrl, internalToken } = workerData as SnapshotWorkerData;
const backend = createBackendClient({ baseUrl: backendUrl, internalToken });
const port = parentPort!;

/** The mirrors of the open documents by their names. */
const mirrors = new Map<string, Y.Doc>();
/** The text for search that the backend has of each open board, as the worker sent it last. */
const searchTexts = new Map<string, string>();

const reply = (message: SnapshotReply) => port.postMessage(message);

const serialized = (error: unknown): SerializedError =>
  error instanceof Error
    ? { name: error.name, message: error.message, ...(error.stack !== undefined && { stack: error.stack }) }
    : { name: "Error", message: String(error) };

const close = (name: string) => {
  mirrors.get(name)?.destroy();
  mirrors.delete(name);
  searchTexts.delete(name);
};

/**
 * Sends the text of a stored board for search, unless the backend has it already. A failure leaves the stored state as
 * it is: the next store sends the text again.
 */
async function storeSearchText(
  name: string,
  boardId: string,
  text: string,
): Promise<{ searchText: StoredSearchText; error?: SerializedError }> {
  if (searchTexts.get(name) === text) return { searchText: null };
  searchTexts.delete(name);
  try {
    await backend.storeSearchText(boardId, text);
    searchTexts.set(name, text);
    return { searchText: "stored" };
  } catch (error) {
    // The board was deleted right after its state was stored.
    if (error instanceof BoardNotFoundError) return { searchText: null };
    return { searchText: "failed", error: serialized(error) };
  }
}

/** How a store that the backend refused ended: a deleted board, a closed or deleted proposal, or a failure. */
function resultOf(error: unknown): StoreResult {
  if (error instanceof BoardNotFoundError) return "board_deleted";
  if (error instanceof ProposalClosedError) return "proposal_closed";
  if (error instanceof ProposalNotFoundError) return "proposal_deleted";
  return "failed";
}

/**
 * Encodes the mirror and stores it, then sends the text of a board. The text is extracted before anything is awaited:
 * changes that arrive while the state is on its way apply to the mirror, and the text is to be of the stored state.
 */
async function store(mirror: Y.Doc, { name, target, editors }: Extract<SnapshotRequest, { type: "store" }>) {
  const started = performance.now();
  const state = Y.encodeStateAsUpdate(mirror);
  const text = target.kind === "board" ? searchTextOf(mirror) : null;
  let result: StoreResult = "stored";
  let error: SerializedError | undefined;
  try {
    if (target.kind === "board") await backend.storeDocument(target.id, state, editors);
    else await backend.storeDraft(target.id, state);
  } catch (refused) {
    result = resultOf(refused);
    if (result === "failed") error = serialized(refused);
  }
  // The time of the store is that of encoding and storing the state, without the text.
  const seconds = (performance.now() - started) / 1000;
  let searchText: StoredSearchText = null;
  if (result === "stored" && text !== null) ({ searchText, error } = await storeSearchText(name, target.id, text));
  return { result, seconds, size: state.length, searchText, ...(error && { error }) };
}

port.on("message", (request: SnapshotRequest) => {
  switch (request.type) {
    case "open": {
      // A name opened again replaces its mirror: it is a document loaded anew.
      close(request.name);
      const mirror = new Y.Doc();
      if (request.state) Y.applyUpdate(mirror, request.state);
      mirrors.set(request.name, mirror);
      break;
    }
    case "update": {
      // A document without a mirror is encoded anew at its next store; its changes until then are in that state.
      const mirror = mirrors.get(request.name);
      if (mirror) Y.applyUpdate(mirror, request.update);
      break;
    }
    case "close":
      close(request.name);
      break;
    case "store": {
      const { id, name } = request;
      const mirror = mirrors.get(name);
      if (!mirror) {
        reply({ type: "missing", id });
        break;
      }
      // A store that cannot even encode is a failure of that store, not of the worker.
      void store(mirror, request).then(
        (stored) => reply({ type: "stored", id, ...stored }),
        (error: unknown) =>
          reply({
            type: "stored",
            id,
            result: "failed",
            seconds: 0,
            size: null,
            searchText: null,
            error: serialized(error),
          }),
      );
      break;
    }
    case "search-text": {
      const mirror = mirrors.get(request.name);
      reply({ type: "search-text", id: request.id, text: mirror ? searchTextOf(mirror) : null });
      break;
    }
  }
});
