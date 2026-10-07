import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { BoardNotFoundError, type BackendClient } from "../src/backend-client.js";
import { configureLogging } from "../src/log.js";
import { createMetrics } from "../src/metrics.js";
import { BACKFILL_BATCH, createSearchTextBackfill } from "../src/search-text-backfill.js";

/** A board id that sorts by its number. */
const boardId = (n: number) => `0199a000-0000-7000-8000-${String(n).padStart(12, "0")}`;

/** A stored state of a board with one page named `name`. */
function state(name: string): Uint8Array {
  const document = new Y.Doc();
  document.getMap("pages").set("page-1", { name, order: "a0" });
  return Y.encodeStateAsUpdate(document);
}

/** The part of the backend that the backfill talks to, in memory. */
class Backend {
  readonly documents = new Map<string, Uint8Array>();
  readonly texts = new Map<string, string>();
  /** Boards whose state cannot be loaded, as when the backend fails. */
  readonly failing = new Set<string>();
  /** Boards deleted after they were listed. */
  readonly deleted = new Set<string>();
  /** Boards that get a text from a store right before the backfill sends its own. */
  readonly storedMeanwhile = new Set<string>();
  pages = 0;

  readonly client: BackendClient = {
    loadDocument: async (id) => {
      if (this.failing.has(id)) throw new Error("backend responded with 500");
      if (this.deleted.has(id)) throw new BoardNotFoundError(id);
      return this.documents.get(id) ?? null;
    },
    storeSearchText: async (id, text, { onlyIfMissing = false } = {}) => {
      if (this.storedMeanwhile.has(id)) this.texts.set(id, "Новее");
      if (onlyIfMissing && this.texts.has(id)) return false;
      this.texts.set(id, text);
      return true;
    },
    boardsWithoutSearchText: async (after, limit) => {
      this.pages++;
      return Array.from(this.documents.keys())
        .filter((id) => !this.texts.has(id) && (after === null || id > after))
        .sort()
        .slice(0, limit);
    },
    storeDocument: async () => {},
    loadAccess: async () => ({ ownerId: "", linkAccess: "edit", members: {} }),
    loadDraft: async () => null,
    storeDraft: async () => {},
    loadDraftAccess: async () => {
      throw new Error("not used");
    },
  };
}

describe("search text backfill", () => {
  let backend: Backend;
  const errors: string[] = [];

  beforeEach(() => {
    backend = new Backend();
    configureLogging("text", (level, line) => {
      if (level === "error") errors.push(line);
    });
  });

  afterEach(() => {
    errors.splice(0);
    configureLogging("text");
  });

  it("sends the texts of all boards without one, page by page, and leaves the others", async () => {
    const count = BACKFILL_BATCH * 2 + 3;
    for (let n = 1; n <= count; n++) backend.documents.set(boardId(n), state(`Доска ${n}`));
    backend.texts.set(boardId(1), "Есть");

    const stored = await createSearchTextBackfill(backend.client, createMetrics(), () => undefined).run();

    expect(stored).toBe(count - 1);
    expect(backend.texts.get(boardId(1))).toBe("Есть");
    expect(backend.texts.get(boardId(count))).toBe(`Доска ${count}`);
    expect(backend.pages).toBe(3);
  });

  it("reads a board open in collab from memory", async () => {
    backend.documents.set(boardId(1), state("Сохранённая"));
    const open = new Y.Doc();
    open.getMap("pages").set("page-1", { name: "Открытая", order: "a0" });

    await createSearchTextBackfill(backend.client, createMetrics(), (id) => (id === boardId(1) ? open : undefined)).run();

    expect(backend.texts.get(boardId(1))).toBe("Открытая");
  });

  it("passes a board it cannot read once, logs it and goes on, and skips a deleted one quietly", async () => {
    for (let n = 1; n <= 3; n++) backend.documents.set(boardId(n), state(`Доска ${n}`));
    backend.failing.add(boardId(1));
    backend.deleted.add(boardId(2));
    const metrics = createMetrics();

    const stored = await createSearchTextBackfill(backend.client, metrics, () => undefined).run();

    expect(stored).toBe(1);
    expect(backend.texts.get(boardId(3))).toBe("Доска 3");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`Failed to fill in the text of board ${boardId(1)}`);
    expect(await metrics.registry.getSingleMetricAsString("codraw_collab_search_texts_total")).toContain(
      'codraw_collab_search_texts_total{result="failed"} 1',
    );
  });

  it("does not replace a text that a store sent while it read the state", async () => {
    backend.documents.set(boardId(1), state("Старая"));
    backend.storedMeanwhile.add(boardId(1));
    const metrics = createMetrics();

    const stored = await createSearchTextBackfill(backend.client, metrics, () => undefined).run();

    expect(stored).toBe(0);
    expect(backend.texts.get(boardId(1))).toBe("Новее");
    expect(await metrics.registry.getSingleMetricAsString("codraw_collab_search_texts_total")).toContain(
      'codraw_collab_search_texts_total{result="kept"} 1',
    );
  });

  it("runs one pass at a time and stops before the next board", async () => {
    for (let n = 1; n <= 3; n++) backend.documents.set(boardId(n), state(`Доска ${n}`));
    const backfill = createSearchTextBackfill(backend.client, createMetrics(), () => undefined);

    const first = backfill.run();
    expect(backfill.run()).toBe(first);
    backfill.stop();

    await first;
    expect(backend.texts.size).toBeLessThan(3);
    await expect(backfill.run()).resolves.toBe(0);
  });
});
