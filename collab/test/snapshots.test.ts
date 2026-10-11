import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { configureLogging } from "../src/log.js";
import { createSnapshots, type Snapshots } from "../src/snapshots.js";

const board = "0199a000-0000-7000-8000-000000000001";

/** A worker script that throws before it gets to tell it started. */
const brokenWorker = new URL(`data:text/javascript,${encodeURIComponent('throw new Error("broken");')}`);

describe("snapshots", () => {
  const errors: string[] = [];
  const warnings: string[] = [];
  let snapshots: Snapshots | undefined;

  beforeEach(() => {
    configureLogging("text", (level, line) => {
      if (level === "error") errors.push(line);
      if (level === "warn") warnings.push(line);
    });
  });

  afterEach(async () => {
    await snapshots?.destroy();
    errors.splice(0);
    warnings.splice(0);
    configureLogging("text");
  });

  const stopped = () => errors.filter((line) => line.includes("The snapshot worker stopped")).length;

  it("does not start a worker that cannot start again and again, and fails the stores meanwhile", async () => {
    snapshots = createSnapshots({ backendUrl: "http://127.0.0.1:1", internalToken: "unused", workerUrl: brokenWorker });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(stopped()).toBe(1);

    const outcome = await snapshots.store(board, { kind: "board", id: board }, [], new Y.Doc());

    expect(outcome).toMatchObject({ result: "failed", size: null });
    expect(stopped()).toBe(2);
  });

  it("fails a store once destroyed without encoding the document, and answers no text", async () => {
    snapshots = createSnapshots({ backendUrl: "http://127.0.0.1:1", internalToken: "unused" });
    snapshots.open(board, null);
    const asked = snapshots.searchText(board);
    await snapshots.destroy();

    const outcome = await snapshots.store(board, { kind: "board", id: board }, [], new Y.Doc());

    expect(outcome).toMatchObject({ result: "failed", size: null });
    // The document is encoded on the main thread for a new mirror only with a warning.
    expect(warnings).toEqual([]);
    await expect(asked).resolves.toBeNull();
    await expect(snapshots.searchTextOfState(Y.encodeStateAsUpdate(new Y.Doc()))).resolves.toBeNull();
    expect(errors).toEqual([]);
  });
});
