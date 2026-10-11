import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createDocumentSizes, DocumentTooLargeError } from "../src/size.js";

/** A change that adds `bytes` of text, a little more with its encoding. */
function change(bytes: number): Uint8Array {
  const document = new Y.Doc();
  document.getMap("meta").set("title", "x".repeat(bytes));
  return Y.encodeStateAsUpdate(document);
}

describe("document sizes", () => {
  it("counts the changes accepted since the document was loaded", () => {
    const sizes = createDocumentSizes(10_000);
    sizes.set("board", 1_000);
    const update = change(500);

    sizes.accept("board", new Y.Doc(), update);

    expect(sizes.get("board")).toBe(1_000 + update.length);
  });

  it("makes the size exact at a store, keeping the changes accepted while the store was on its way", () => {
    const sizes = createDocumentSizes(10_000);
    sizes.set("board", 1_000);
    const before = change(500);
    const after = change(700);
    sizes.accept("board", new Y.Doc(), before);

    const mark = sizes.storing("board");
    sizes.accept("board", new Y.Doc(), after);
    // Merged and with deletions, the stored state is smaller than the counted changes.
    sizes.stored("board", 1_200, mark);

    expect(sizes.get("board")).toBe(1_200 + after.length);
  });

  it("stays an upper bound when stores end out of order", () => {
    const sizes = createDocumentSizes(10_000);
    sizes.set("board", 0);
    const first = sizes.storing("board");
    const between = change(300);
    sizes.accept("board", new Y.Doc(), between);
    const second = sizes.storing("board");
    const last = change(400);
    sizes.accept("board", new Y.Doc(), last);

    sizes.stored("board", 2_000, second);
    sizes.stored("board", 1_500, first);

    // The first state has none of the later changes; counted with them, it is not less than the document.
    expect(sizes.get("board")).toBe(1_500 + between.length + last.length);
  });

  it("refuses a change beyond the limit counted with the changes accepted while a store was on its way", () => {
    const sizes = createDocumentSizes(2_000);
    sizes.set("board", 0);
    const mark = sizes.storing("board");
    sizes.accept("board", new Y.Doc(), change(900));
    sizes.stored("board", 500, mark);

    expect(() => sizes.accept("board", new Y.Doc(), change(700))).toThrow(DocumentTooLargeError);
  });

  it("ignores a store of a document that was unloaded meanwhile", () => {
    const sizes = createDocumentSizes(10_000);
    sizes.set("board", 1_000);
    const mark = sizes.storing("board");
    sizes.forget("board");

    sizes.stored("board", 5_000, mark);

    expect(sizes.get("board")).toBe(0);
  });
});
