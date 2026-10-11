import type { CollabDocument } from "./documents.js";
import type { StoreResult } from "./metrics.js";

/** What the snapshot worker gets when it starts: where the backend is, to store the documents itself. */
export interface SnapshotWorkerData {
  backendUrl: string;
  internalToken: string;
}

/**
 * Messages from the main thread to the snapshot worker. The worker handles them in the order they were posted, so a
 * store sees every change posted before it.
 */
export type SnapshotRequest =
  /** A document was loaded: the worker starts its mirror from the same state, or empty. */
  | { type: "open"; name: string; state: Uint8Array | null }
  /** A change applied to the document; the worker applies it to the mirror. */
  | { type: "update"; name: string; update: Uint8Array }
  /** The document was unloaded: the worker drops its mirror. */
  | { type: "close"; name: string }
  /** Store the mirror of the document in the backend, naming the users who changed it since the previous store. */
  | { type: "store"; id: number; name: string; target: CollabDocument; editors: string[] }
  /** The text for search of the mirror of an open board. */
  | { type: "search-text"; id: number; name: string };

/** An error as it crosses between threads: the worker sends what the log needs of it. */
export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

/** How sending the text of a stored board ended: `null` when it was not sent, as unchanged or of a board gone. */
export type StoredSearchText = "stored" | "failed" | null;

/** Answers of the snapshot worker to the requests by their ids. */
export type SnapshotReply =
  /** The worker has no mirror of the document to store, e.g. it started after the document was loaded. */
  | { type: "missing"; id: number }
  | {
      type: "stored";
      id: number;
      result: StoreResult;
      /** Time of encoding the state and storing it in the backend, in seconds. */
      seconds: number;
      /** The size of the encoded state in bytes, whatever the backend answered; `null` when it was not encoded. */
      size: number | null;
      searchText: StoredSearchText;
      /** Why the store failed, or, for a stored board, why its text did not reach the backend. */
      error?: SerializedError;
    }
  /** The text of the board, or `null` when the worker has no mirror of it. */
  | { type: "search-text"; id: number; text: string | null };
