import { describe, expect, it } from "vitest";
import { createDocumentEditors } from "../src/editors.js";

const board = "0199a000-0000-7000-8000-000000000001";
const otherBoard = "0199a000-0000-7000-8000-000000000002";

describe("editors of documents", () => {
  it("names each user once, in the order of their first change, and starts anew after a take", () => {
    const editors = createDocumentEditors();
    editors.add(board, "bob");
    editors.add(board, "alice");
    editors.add(board, "bob");
    editors.add(otherBoard, "carol");

    expect(editors.take(board)).toEqual(["bob", "alice"]);
    expect(editors.take(board)).toEqual([]);
    expect(editors.take(otherBoard)).toEqual(["carol"]);
  });

  it("puts the users given back in front of those who changed the document since", () => {
    const editors = createDocumentEditors();
    editors.add(board, "bob");
    const taken = editors.take(board);
    editors.add(board, "alice");
    editors.add(board, "bob");

    editors.giveBack(board, taken);

    expect(editors.take(board)).toEqual(["bob", "alice"]);
  });

  it("keeps at most the limit", () => {
    const editors = createDocumentEditors(2);
    ["anna", "boris", "vera"].forEach((user) => editors.add(board, user));
    expect(editors.take(board)).toEqual(["anna", "boris"]);

    editors.add(board, "vera");
    editors.giveBack(board, ["anna", "boris"]);
    expect(editors.take(board)).toEqual(["anna", "boris"]);
  });

  it("forgets a document", () => {
    const editors = createDocumentEditors();
    editors.add(board, "bob");

    editors.forget(board);

    expect(editors.take(board)).toEqual([]);
  });
});
