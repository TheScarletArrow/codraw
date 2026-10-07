import * as Y from "yjs";

/** The longest text of a board for search, in UTF-16 units; the backend refuses a longer one. */
export const SEARCH_TEXT_LIMIT = 100_000;

/** Elements of a page whose `value` is text that people read: shapes, tables, fields, indexes and edges. */
const TEXT_KINDS = new Set(["vertex", "edge"]);

/** Character references that labels of draw.io use, besides numeric ones. */
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * A label as it reads: without markup, a line break as a space, character references decoded, a run of spaces as one,
 * without spaces around it.
 */
export function plainText(label: string): string {
  return label
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (reference, name: string) => {
      if (name.startsWith("#")) {
        const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : reference;
      }
      return ENTITIES[name.toLowerCase()] ?? reference;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** A page entry: a Y.Map, or a plain object in documents of schema version 1. */
function pageField(entry: unknown, field: "name" | "order"): string {
  const value = entry instanceof Y.Map ? entry.get(field) : (entry as Record<string, unknown> | null)?.[field];
  return typeof value === "string" ? value : "";
}

const byOrder = (a: { order: string; id: string }, b: { order: string; id: string }) =>
  a.order !== b.order ? (a.order < b.order ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * The text of a board document that search finds the board by: the pages in their order, each with its name and then
 * the texts of its shapes, tables, fields, indexes and edges in the order of the elements, as {@link plainText} reads
 * them. Each text is a line of its own and comes once; the text ends at {@link SEARCH_TEXT_LIMIT}.
 */
export function searchTextOf(doc: Y.Doc): string {
  const pages = Array.from(doc.getMap("pages").entries(), ([id, entry]) => ({
    id,
    name: pageField(entry, "name"),
    order: pageField(entry, "order"),
  })).sort(byOrder);
  const lines = new Set<string>();
  const add = (text: string) => {
    const line = plainText(text);
    if (line) lines.add(line);
  };
  for (const page of pages) {
    add(page.name);
    const cells: { id: string; order: string; value: string }[] = [];
    for (const [id, cell] of doc.getMap(`cells:${page.id}`).entries()) {
      if (!(cell instanceof Y.Map) || !TEXT_KINDS.has(cell.get("kind") as string)) continue;
      const value = cell.get("value");
      if (typeof value !== "string" || !value) continue;
      const order = cell.get("order");
      cells.push({ id, order: typeof order === "string" ? order : "", value });
    }
    cells.sort(byOrder).forEach((cell) => add(cell.value));
  }
  return cut(Array.from(lines).join("\n"));
}

/** The text up to the limit, without half of a pair of surrogates at the end. */
function cut(text: string): string {
  if (text.length <= SEARCH_TEXT_LIMIT) return text;
  const end = /[\uD800-\uDBFF]/.test(text[SEARCH_TEXT_LIMIT - 1]!) ? SEARCH_TEXT_LIMIT - 1 : SEARCH_TEXT_LIMIT;
  return text.slice(0, end);
}
