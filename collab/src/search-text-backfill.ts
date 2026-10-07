import * as Y from "yjs";
import { BoardNotFoundError, type BackendClient } from "./backend-client.js";
import { log } from "./log.js";
import type { Metrics } from "./metrics.js";
import { searchTextOf } from "./search-text.js";

/** How many boards without a text a pass asks the backend for at a time. */
export const BACKFILL_BATCH = 20;

export interface SearchTextBackfill {
  /**
   * Goes once through the boards whose stored documents have no text for search and sends their texts; resolves with
   * how many it stored. A call while a pass goes on gets that pass.
   */
  run(): Promise<number>;
  /** Ends the pass that goes on before its next board. */
  stop(): void;
}

/**
 * Fills in the texts for search of boards whose documents were stored before collab extracted texts, or whose first
 * text did not reach the backend: nobody may open such a board, so no store would send its text. A board open in
 * collab is read from memory, any other one from its stored state. Texts go with `onlyIfMissing`, so that the text of a
 * state read before a newer store does not replace the text of that store.
 */
export function createSearchTextBackfill(
  backend: BackendClient,
  metrics: Metrics,
  openDocument: (boardId: string) => Y.Doc | undefined,
): SearchTextBackfill {
  let running: Promise<number> | null = null;
  let stopped = false;

  const textOf = async (boardId: string): Promise<string | null> => {
    const open = openDocument(boardId);
    if (open) return searchTextOf(open);
    const state = await backend.loadDocument(boardId);
    if (!state) return null;
    const document = new Y.Doc();
    try {
      Y.applyUpdate(document, state);
      return searchTextOf(document);
    } finally {
      document.destroy();
    }
  };

  /** Pages through the boards by id, so that a board whose text cannot be stored is passed once, not again and again. */
  const pass = async () => {
    let stored = 0;
    let after: string | null = null;
    while (!stopped) {
      const boards = await backend.boardsWithoutSearchText(after, BACKFILL_BATCH);
      for (const boardId of boards) {
        if (stopped) break;
        try {
          const text = await textOf(boardId);
          if (text === null) continue;
          const sent = await backend.storeSearchText(boardId, text, { onlyIfMissing: true });
          metrics.searchTextSent(sent ? "stored" : "kept");
          if (sent) stored++;
        } catch (error) {
          // A board deleted meanwhile needs no text.
          if (error instanceof BoardNotFoundError) continue;
          metrics.searchTextSent("failed");
          log.error(`Failed to fill in the text of board ${boardId}`, error, { "codraw.board": boardId });
        }
      }
      if (boards.length < BACKFILL_BATCH) break;
      after = boards.at(-1)!;
    }
    return stored;
  };

  return {
    run() {
      running ??= pass().finally(() => {
        running = null;
      });
      return running;
    },
    stop() {
      stopped = true;
    },
  };
}
