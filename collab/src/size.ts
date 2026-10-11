import * as Y from "yjs";

/** The default limit of a board document: 16 MiB. */
export const DOCUMENT_SIZE_LIMIT = 16 * 1024 * 1024;

/** Reason of closing the connection of a participant whose change would make the document larger than the limit. */
export const DOCUMENT_TOO_LARGE = "document-too-large";

export class DocumentTooLargeError extends Error {
  /** Hocuspocus closes the connection to the document with this code and reason. */
  readonly code = 4413;
  readonly reason = DOCUMENT_TOO_LARGE;

  constructor(documentName: string, limit: number) {
    super(`The change would make board ${documentName} larger than ${limit} bytes`);
    this.name = "DocumentTooLargeError";
  }
}

/** A change that only deletes is never larger than this; larger changes are not decoded to find out. */
const DELETION_SIZE = 64 * 1024;

/** Whether the Yjs update only deletes, so that it frees space rather than takes it. */
export function onlyDeletes(update: Uint8Array): boolean {
  return update.length <= DELETION_SIZE && Y.decodeUpdate(update).structs.length === 0;
}

/**
 * Sizes of the open documents, without encoding a document on every change: exact once a document is loaded or
 * stored, plus the changes accepted since. Deletions and merging only make a document smaller, so this is an upper
 * bound that the next store makes exact again.
 *
 * The size of a store comes from the snapshot worker after the store was asked for, when more changes may have been
 * accepted. A store therefore takes a mark of the changes accepted until it was asked for, and its size counts with
 * those accepted after the mark: the stored state has every change before the mark, so the size stays an upper bound.
 */
export function createDocumentSizes(limit: number) {
  /** The size of each document, and the bytes of all changes it accepted since it was loaded. */
  const sizes = new Map<string, { size: number; accepted: number }>();
  return {
    /** The exact size of the document, e.g. of the state just loaded. */
    set(documentName: string, size: number) {
      const entry = sizes.get(documentName);
      if (entry) entry.size = size;
      else sizes.set(documentName, { size, accepted: 0 });
    },
    /** A store of the document is asked for: the mark of the changes in its state, for {@link stored}. */
    storing(documentName: string): number {
      return sizes.get(documentName)?.accepted ?? 0;
    },
    /** The store asked for at `mark` encoded `size` bytes: the size is that plus the changes accepted since. */
    stored(documentName: string, size: number, mark: number) {
      const entry = sizes.get(documentName);
      if (entry) entry.size = size + entry.accepted - mark;
    },
    /** The size that the next change counts against the limit with. */
    get(documentName: string): number {
      return sizes.get(documentName)?.size ?? 0;
    },
    forget(documentName: string) {
      sizes.delete(documentName);
    },
    /**
     * Counts a change of the document, or throws {@link DocumentTooLargeError} when it adds to a document that would
     * become larger than the limit with it.
     */
    accept(documentName: string, update: Uint8Array) {
      const entry = sizes.get(documentName) ?? { size: 0, accepted: 0 };
      const size = entry.size + update.length;
      if (size > limit && !onlyDeletes(update)) throw new DocumentTooLargeError(documentName, limit);
      entry.size = size;
      entry.accepted += update.length;
      sizes.set(documentName, entry);
    },
  };
}
