import { Worker } from "node:worker_threads";
import * as Y from "yjs";
import type { CollabDocument } from "./documents.js";
import { log } from "./log.js";
import type { StoreResult } from "./metrics.js";
import type {
  SerializedError,
  SnapshotReply,
  SnapshotRequest,
  SnapshotWorkerData,
  StoredSearchText,
} from "./snapshot-messages.js";

/** How a store of a document ended, as the snapshot worker tells. */
export interface StoreOutcome {
  result: StoreResult;
  /** Time of encoding the state and storing it in the backend, in seconds. */
  seconds: number;
  /** The size of the stored state in bytes; `null` when it is not known, e.g. the worker failed. */
  size: number | null;
  /** How sending the text of a stored board ended; `null` when it was not sent. */
  searchText: StoredSearchText;
  /** Why the store failed, or, for a stored board, why its text did not reach the backend. */
  error?: Error;
}

/**
 * Stores the open documents outside the main thread. The main thread of collab delivers the changes and cursors of all
 * boards of the process; while it encodes a document, extracts its text or sends it, none of them moves. On a board of
 * 60 000 shapes (17 MiB) encoding took 479 ms, the text 123 ms, and sending the body stalled the event loop for up to
 * 0.3 s more, at every store (issue #174, docs/adr/0012-document-stores.md).
 *
 * So a worker thread keeps a mirror of every open document: the state it was loaded with and every change applied to it
 * since, in the same order. A store asks the worker, which encodes its mirror, extracts the text and sends both to the
 * backend itself; the main thread only forwards small changes. Messages to the worker are handled in order, so a store
 * sees every change applied before it was asked for. The Y.Doc itself never crosses between threads: it can only cross
 * encoded, which is the work to avoid.
 *
 * When the worker fails, the stores it was doing fail as well, and Hocuspocus keeps their documents to store them with
 * their next change. A new worker starts; a document that it has no mirror of is encoded on the main thread once, at
 * its next store, and goes to the worker, so no change is lost.
 */
export interface Snapshots {
  /** The document was loaded with this state, already applied to it, or empty; the worker starts its mirror. */
  open(name: string, state: Uint8Array | null): void;
  /** The change was applied to the document. The worker gets a copy: Hocuspocus sends this buffer to participants. */
  update(name: string, update: Uint8Array): void;
  /**
   * Stores the document, which the users `editors` changed since the previous store. The state is that of the mirror
   * with every change passed to {@link update} before; `document` is encoded here only when the worker has no mirror of
   * it. Never rejects: a failure is an outcome.
   */
  store(name: string, target: CollabDocument, editors: readonly string[], document: Y.Doc): Promise<StoreOutcome>;
  /** The document was unloaded. */
  close(name: string): void;
  /** The text for search of the open board, or `null` when the worker has no mirror of it. */
  searchText(name: string): Promise<string | null>;
  /** Stops the worker; the documents are to be stored by now. */
  destroy(): Promise<void>;
  /** Ends the worker as a crash would, keeping the snapshots working; tests check the recovery with it. */
  terminateWorker(): Promise<void>;
}

export interface SnapshotsOptions {
  backendUrl: string;
  internalToken: string;
}

/**
 * The script of the worker: the compiled one next to this module, or, when collab runs from its TypeScript sources
 * (tests, `pnpm dev`), an entry that loads tsx into the thread first.
 */
const workerUrl = () =>
  new URL(import.meta.url.endsWith(".ts") ? "./snapshot-worker-entry.mjs" : "./snapshot-worker.js", import.meta.url);

const errorOf = ({ name, message, stack }: SerializedError): Error =>
  Object.assign(new Error(message), { name, ...(stack !== undefined && { stack }) });

export function createSnapshots({ backendUrl, internalToken }: SnapshotsOptions): Snapshots {
  const workerData: SnapshotWorkerData = { backendUrl, internalToken };
  /** The running worker; a new one starts when it ends, unless the snapshots are destroyed. */
  let worker: Worker | undefined;
  let destroyed = false;
  let nextId = 1;
  const pending = new Map<number, { resolve: (reply: SnapshotReply) => void; reject: (error: Error) => void }>();
  /** The documents that the running worker has mirrors of. */
  const mirrored = new Set<string>();

  const fail = (error: Error) => {
    const requests = [...pending.values()];
    pending.clear();
    requests.forEach(({ reject }) => reject(error));
  };

  const start = (): Worker => {
    const started = new Worker(workerUrl(), { workerData });
    let failure: Error | undefined;
    let online = false;
    started.once("online", () => {
      online = true;
    });
    // An idle worker does not keep the process alive; a store or a question it has not answered yet does.
    started.unref();
    started.on("message", (reply: SnapshotReply) => {
      const request = pending.get(reply.id);
      pending.delete(reply.id);
      if (pending.size === 0) started.unref();
      request?.resolve(reply);
    });
    started.on("error", (error) => {
      failure = error;
    });
    started.on("exit", (code) => {
      if (worker !== started) return;
      worker = undefined;
      mirrored.clear();
      fail(failure ?? new Error(`The snapshot worker exited with code ${code}`));
      log.error("The snapshot worker stopped; open documents are encoded anew at their next stores", failure, {
        "process.exit_code": code,
      });
      // A worker that could not even start is not started again and again: the next document or store starts one.
      if (!destroyed && online) worker = start();
    });
    return started;
  };
  // Started at once, so that the first store does not wait for the thread to start.
  worker = start();

  const post = (request: SnapshotRequest, transfer: ArrayBuffer[] = []) => {
    (worker ??= start()).postMessage(request, transfer);
  };

  const ask = (request: (id: number) => SnapshotRequest) =>
    new Promise<SnapshotReply>((resolve, reject) => {
      if (destroyed) throw new Error("The snapshots are destroyed");
      const id = nextId++;
      pending.set(id, { resolve, reject });
      post(request(id));
      worker!.ref();
    });

  const open = (name: string, state: Uint8Array | null, transfer: ArrayBuffer[] = []) => {
    if (destroyed) return;
    post({ type: "open", name, state }, transfer);
    mirrored.add(name);
  };

  /**
   * Gives the worker the whole document when it has no mirror of it: once after the worker failed. It encodes on the
   * main thread, which the worker is there to avoid, so it is logged.
   */
  const mirror = (name: string, document: Y.Doc) => {
    log.warn(`Encoding document ${name} on the main thread for a new mirror`, { "codraw.document": name });
    const state = Y.encodeStateAsUpdate(document);
    // Nothing else holds the encoded state, so its buffer moves instead of being copied.
    open(name, state, [state.buffer as ArrayBuffer]);
  };

  return {
    // The loaded state is copied rather than moved: the caller keeps it, and copying costs little next to applying it.
    open: (name, state) => open(name, state),

    update(name, update) {
      // A document without a mirror is encoded whole at its next store, with this change.
      if (mirrored.has(name)) post({ type: "update", name, update });
    },

    async store(name, target, editors, document) {
      const started = performance.now();
      try {
        // The second attempt is for a worker that tells it has no mirror, though it was given one.
        for (let attempt = 1; attempt <= 2; attempt++) {
          if (!mirrored.has(name)) mirror(name, document);
          const reply = await ask((id) => ({ type: "store", id, name, target, editors: [...editors] }));
          if (reply.type === "stored") {
            const { result, seconds, size, searchText, error } = reply;
            return { result, seconds, size, searchText, ...(error && { error: errorOf(error) }) };
          }
          mirrored.delete(name);
        }
        throw new Error(`The snapshot worker has no mirror of document ${name}`);
      } catch (error) {
        return {
          result: "failed",
          seconds: (performance.now() - started) / 1000,
          size: null,
          searchText: null,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },

    close(name) {
      if (mirrored.delete(name)) post({ type: "close", name });
    },

    async searchText(name) {
      if (!mirrored.has(name)) return null;
      const reply = await ask((id) => ({ type: "search-text", id, name }));
      return reply.type === "search-text" ? reply.text : null;
    },

    async destroy() {
      destroyed = true;
      const stopping = worker;
      worker = undefined;
      mirrored.clear();
      fail(new Error("The snapshots are destroyed"));
      await stopping?.terminate();
    },

    async terminateWorker() {
      await worker?.terminate();
    },
  };
}
