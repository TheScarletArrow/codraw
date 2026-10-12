import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCoEditing, REPORT_RETRY_DELAY } from "../src/coediting.js";
import { configureLogging } from "../src/log.js";

const board = "0199a000-0000-7000-8000-000000000001";
const otherBoard = "0199a000-0000-7000-8000-000000000002";

/** Noon of a UTC day, so that a test moves within the day or over midnight on purpose. */
const NOON = Date.UTC(2026, 9, 12, 12);
const HOUR = 60 * 60 * 1000;

describe("boards edited together", () => {
  let time: number;
  let reports: string[];
  let failing: number;
  const errors: string[] = [];
  const coEditing = () =>
    createCoEditing(
      async (boardId) => {
        reports.push(boardId);
        if (failing > 0) {
          failing--;
          throw new Error("backend responded with 500");
        }
      },
      () => time,
    );
  /** A connection of the user, as its context; the same object stands for it when it disconnects. */
  const connection = () => ({});

  beforeEach(() => {
    time = NOON;
    reports = [];
    failing = 0;
    configureLogging("text", (level, line) => {
      if (level === "error") errors.push(line);
    });
  });

  afterEach(() => {
    errors.splice(0);
    configureLogging("text");
    vi.useRealTimers();
  });

  it("reports a board once a day when two users who may edit are connected and its document changes", () => {
    const boards = coEditing();
    const alice = connection();
    const bob = connection();
    boards.connected(board, "alice", alice);
    boards.changed(board);
    expect(reports).toEqual([]);

    boards.connected(board, "bob", bob);
    boards.changed(board);
    boards.disconnected(board, "bob", bob);
    boards.connected(board, "bob", connection());
    boards.changed(board);

    expect(reports).toEqual([board]);
  });

  it("does not report two tabs of one user, nor two editors who change nothing", () => {
    const boards = coEditing();
    boards.connected(board, "alice", connection());
    boards.connected(board, "alice", connection());
    boards.changed(board);
    boards.connected(otherBoard, "alice", connection());
    boards.connected(otherBoard, "bob", connection());

    expect(reports).toEqual([]);
  });

  it("reports a board changed earlier that day once two users may edit it at the same time", () => {
    const boards = coEditing();
    const alice = connection();
    boards.connected(board, "alice", alice);
    boards.changed(board);
    boards.disconnected(board, "alice", alice);
    boards.forget(board);

    time += HOUR;
    boards.connected(board, "alice", connection());
    boards.connected(board, "bob", connection());

    expect(reports).toEqual([board]);
  });

  it("counts the editors who left before the change of the day", () => {
    const boards = coEditing();
    const bob = connection();
    boards.connected(board, "alice", connection());
    boards.connected(board, "bob", bob);
    boards.disconnected(board, "bob", bob);

    boards.changed(board);

    expect(reports).toEqual([board]);
  });

  it("lets go of a user only when their last connection leaves, and ignores what it did not count", () => {
    const boards = coEditing();
    const first = connection();
    boards.connected(board, "alice", first);
    boards.connected(board, "alice", connection());
    boards.disconnected(board, "alice", first);
    boards.disconnected(board, "alice", first);
    boards.disconnected(board, "bob", connection());

    boards.connected(board, "bob", connection());
    boards.changed(board);

    expect(reports).toEqual([board]);
  });

  it("starts again at midnight UTC, with the editors still connected", () => {
    const boards = coEditing();
    boards.connected(board, "alice", connection());
    boards.connected(board, "bob", connection());
    boards.changed(board);

    time = NOON + 12 * HOUR;
    boards.changed(board);
    boards.changed(board);

    expect(reports).toEqual([board, board]);
  });

  it("tries a report that failed again a minute later, on a later change", async () => {
    vi.useFakeTimers();
    failing = 1;
    const boards = coEditing();
    boards.connected(board, "alice", connection());
    boards.connected(board, "bob", connection());
    boards.changed(board);
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toEqual([expect.stringContaining(`Failed to report board ${board} edited together`)]);

    boards.changed(board);
    expect(reports).toEqual([board]);

    await vi.advanceTimersByTimeAsync(REPORT_RETRY_DELAY);
    boards.changed(board);
    boards.changed(board);
    await vi.advanceTimersByTimeAsync(0);

    expect(reports).toEqual([board, board]);
  });
});
