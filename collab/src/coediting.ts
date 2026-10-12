import { log } from "./log.js";

/** A day in milliseconds; days are UTC days, as the backend counts them. */
const DAY = 24 * 60 * 60 * 1000;

/** How long a board whose report failed waits before it is reported again, in milliseconds. */
export const REPORT_RETRY_DELAY = 60_000;

/**
 * Tells the backend which boards were edited together, for the statistics of the installation: a board is edited
 * together on a day when its document changed that day, and at some moment of that day at least two different users had
 * connections to it that may edit. Viewers and several tabs of one user do not make it.
 *
 * Every connect, disconnect and change costs a few lookups in maps and sets, and nothing waits for the backend, which
 * hears of a board at most once a day: what was told today is kept until midnight UTC, also for documents unloaded
 * meanwhile. A report that fails is tried again on a later connect or change of the board, a minute later at the soonest.
 */
export function createCoEditing(report: (boardId: string) => Promise<void>, now: () => number = Date.now) {
  /** The connections that may edit each open board, counted by user. */
  const editors = new Map<string, Map<string, number>>();
  /** The contexts of the connections counted in {@link editors}: a disconnect lets go only of what was counted. */
  const counted = new WeakSet<object>();
  let dayEnds = 0;
  /** Boards whose documents changed today. */
  let changed = new Set<string>();
  /** Boards that two users or more could edit at the same time today. */
  let together = new Set<string>();
  /** Boards told to the backend today, or being told, or waiting after a failed report. */
  let reported = new Set<string>();

  const startDayIfNew = () => {
    const time = now();
    if (time < dayEnds) return;
    dayEnds = (Math.floor(time / DAY) + 1) * DAY;
    changed = new Set();
    together = new Set();
    reported = new Set();
  };

  const editedTogetherNow = (boardId: string) => (editors.get(boardId)?.size ?? 0) >= 2;

  const reportIfEditedTogether = (boardId: string) => {
    if (reported.has(boardId) || !changed.has(boardId) || !together.has(boardId)) return;
    const today = reported;
    today.add(boardId);
    report(boardId).catch((error: unknown) => {
      log.error(`Failed to report board ${boardId} edited together`, error, { "codraw.board": boardId });
      setTimeout(() => today.delete(boardId), REPORT_RETRY_DELAY).unref();
    });
  };

  return {
    /** A connection of the user that may edit the board connected; `context` is the same object when it disconnects. */
    connected(boardId: string, userId: string, context: object) {
      if (counted.has(context)) return;
      counted.add(context);
      let users = editors.get(boardId);
      if (!users) editors.set(boardId, (users = new Map()));
      users.set(userId, (users.get(userId) ?? 0) + 1);
      if (users.size < 2) return;
      startDayIfNew();
      together.add(boardId);
      reportIfEditedTogether(boardId);
    },

    /** A connection disconnected; one that {@link connected} did not count changes nothing. */
    disconnected(boardId: string, userId: string, context: object) {
      if (!counted.has(context)) return;
      counted.delete(context);
      const users = editors.get(boardId);
      if (!users) return;
      const connections = users.get(userId) ?? 0;
      if (connections > 1) users.set(userId, connections - 1);
      else users.delete(userId);
      if (users.size === 0) editors.delete(boardId);
    },

    /** A user changed the document of the board. */
    changed(boardId: string) {
      startDayIfNew();
      if (reported.has(boardId)) return;
      changed.add(boardId);
      // Two editors may have stayed connected since yesterday.
      if (editedTogetherNow(boardId)) together.add(boardId);
      reportIfEditedTogether(boardId);
    },

    /** The document of the board was unloaded: nobody is connected to it any more. */
    forget(boardId: string) {
      editors.delete(boardId);
    },
  };
}

export type CoEditing = ReturnType<typeof createCoEditing>;
