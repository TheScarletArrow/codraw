import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { plainText, SEARCH_TEXT_LIMIT, searchTextOf } from "../src/search-text.js";

interface CellSpec {
  id: string;
  kind: "root" | "layer" | "vertex" | "edge";
  value?: unknown;
  order?: string;
}

/** A board document as the editor writes it: pages in `pages`, the cells of a page in `cells:<page id>`. */
function board(pages: { id: string; name: string; order: string; cells?: CellSpec[] }[]): Y.Doc {
  const doc = new Y.Doc();
  doc.transact(() => {
    for (const page of pages) {
      const entry = new Y.Map<unknown>();
      entry.set("name", page.name);
      entry.set("order", page.order);
      doc.getMap("pages").set(page.id, entry);
      const cells = doc.getMap<Y.Map<unknown>>(`cells:${page.id}`);
      for (const spec of [{ id: "0", kind: "root" }, { id: "1", kind: "layer" }, ...(page.cells ?? [])] as CellSpec[]) {
        const cell = new Y.Map<unknown>();
        cell.set("kind", spec.kind);
        cell.set("value", spec.value ?? "");
        cell.set("order", spec.order ?? "a0");
        cell.set("parent", spec.kind === "root" ? null : spec.kind === "layer" ? "0" : "1");
        cells.set(spec.id, cell);
      }
    }
  });
  return doc;
}

describe("plainText", () => {
  it("drops the markup of a label and decodes its character references", () => {
    expect(plainText("Заказы<br><b>v2</b> &amp; архив")).toBe("Заказы v2 & архив");
    expect(plainText("&lt;b&gt; &quot;x&quot;&nbsp;&#169;&#x41;")).toBe('<b> "x" ©A');
  });

  it("makes a run of spaces and line breaks one space and trims it", () => {
    expect(plainText("  id\n  uuid\t PK  ")).toBe("id uuid PK");
  });

  it("keeps a reference it does not know", () => {
    expect(plainText("a &unknown; b &#0;")).toBe("a &unknown; b &#0;");
  });
});

describe("searchTextOf", () => {
  it("has the names of the pages in their order and the texts of their elements, a line each", () => {
    const doc = board([
      {
        id: "p2",
        name: "Деплой",
        order: "a1",
        cells: [{ id: "k", kind: "vertex", value: "Kubernetes" }],
      },
      {
        id: "p1",
        name: "Схема",
        order: "a0",
        cells: [
          { id: "t", kind: "vertex", value: "users", order: "a0" },
          { id: "f", kind: "vertex", value: "email_confirmed boolean", order: "a1" },
          { id: "e", kind: "edge", value: "<i>пишет</i>", order: "a2" },
        ],
      },
    ]);

    expect(searchTextOf(doc)).toBe("Схема\nusers\nemail_confirmed boolean\nпишет\nДеплой\nKubernetes");
  });

  it("leaves out empty texts, texts that are no strings and the root and the layer, and repeats no text", () => {
    const doc = board([
      {
        id: "p1",
        name: "Схема",
        order: "a0",
        cells: [
          { id: "a", kind: "vertex", value: "id uuid PK", order: "a0" },
          { id: "b", kind: "vertex", value: "id   uuid PK", order: "a1" },
          { id: "c", kind: "vertex", value: "  ", order: "a2" },
          { id: "d", kind: "edge", value: 42, order: "a3" },
          { id: "e", kind: "vertex", value: "Схема", order: "a4" },
        ],
      },
    ]);
    doc.getMap<Y.Map<unknown>>("cells:p1").get("1")!.set("value", "слой");

    expect(searchTextOf(doc)).toBe("Схема\nid uuid PK");
  });

  it("reads pages of schema version 1, which are plain objects", () => {
    const doc = new Y.Doc();
    doc.getMap("pages").set("page-1", { name: "Старая", order: "a0" });

    expect(searchTextOf(doc)).toBe("Старая");
  });

  it("is empty for an empty document", () => {
    expect(searchTextOf(new Y.Doc())).toBe("");
  });

  it("ends at the limit", () => {
    const doc = board([{ id: "p1", name: "я".repeat(SEARCH_TEXT_LIMIT + 10), order: "a0" }]);

    expect(searchTextOf(doc)).toBe("я".repeat(SEARCH_TEXT_LIMIT));
  });

  it("does not end with half of a character outside the basic plane", () => {
    const long = "я".repeat(SEARCH_TEXT_LIMIT - 1);
    const doc = board([{ id: "p1", name: `${long}😀`, order: "a0" }]);

    expect(searchTextOf(doc)).toBe(long);
  });
});
