import type { StyleValue } from './model.ts'

/**
 * The style key of the link of an element: a page of the board, another board or an address of the web. draw.io keeps
 * it as the `link` attribute of the `<UserObject>` around the cell, which the files of CoDraw carry it as.
 */
export const LINK_KEY = 'link'

/** How draw.io writes a link to a page of the file, followed by the id of the page. */
export const PAGE_LINK_PREFIX = 'data:page/id,'

/** Schemes of the addresses that a link opens: the web and mail. Nothing else ever runs from a link. */
const SAFE_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:', 'mailto:'])

/** The path of a board in CoDraw. */
const BOARD_PATH = /^\/boards\/([^/]+)\/?$/

/** Where a link leads: a page of this board, a board of CoDraw (on one of its pages) or an address. */
export type ShapeLink =
  | { kind: 'page'; pageId: string }
  | { kind: 'board'; boardId: string; pageId: string | null; url: string }
  | { kind: 'url'; url: string }

/** The origin of CoDraw, which addresses of boards start with. */
export const appOrigin = (): string => (typeof window === 'undefined' ? '' : window.location.origin)

/** The link to a page of this board. */
export function pageLink(pageId: string): string {
  return `${PAGE_LINK_PREFIX}${pageId}`
}

/** The link to a board: its address in CoDraw, which draw.io and viewers of images open as any other. */
export function boardLink(boardId: string, origin = appOrigin()): string {
  return `${origin}/boards/${encodeURIComponent(boardId)}`
}

/**
 * Reads a link: a page of this board (`data:page/id,<id>`), an address of a board of this CoDraw (with `?page=`, on
 * that page), or an address of the web or of mail. `null` for anything else, e.g. `javascript:`, other `data:` or
 * `file:`: such a link is never shown, opened or written. The address of a link is the one the parser of the browser
 * made of it, encoded and without the tabs and line breaks it drops.
 */
export function parseLink(value: unknown, origin = appOrigin()): ShapeLink | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text.startsWith(PAGE_LINK_PREFIX)) {
    const pageId = text.slice(PAGE_LINK_PREFIX.length)
    return pageId && !/[\s\p{Cc}]/u.test(pageId) ? { kind: 'page', pageId } : null
  }
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (!SAFE_PROTOCOLS.has(url.protocol)) return null
  const board = url.origin === origin ? BOARD_PATH.exec(url.pathname) : null
  if (board) {
    try {
      return { kind: 'board', boardId: decodeURIComponent(board[1]!), pageId: url.searchParams.get('page') || null, url: url.href }
    } catch {
      return null
    }
  }
  return { kind: 'url', url: url.href }
}

/** The link of a style, if CoDraw opens it; see {@link parseLink}. */
export function linkOf(style: Record<string, unknown> | null | undefined, origin = appOrigin()): string | null {
  const value = style?.[LINK_KEY]
  return typeof value === 'string' && parseLink(value, origin) ? value.trim() : null
}

/** A scheme at the start of an address: letters before a colon that is not the colon of a port. */
const SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i
/** An address of mail without `mailto:`. */
const MAIL = /^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/
/** The name of a site, with a port, a path, a query or a fragment after it: `docs.example.com/payments`. */
const SITE = /^(localhost|[^\s/?#:@.]+(\.[^\s/?#:@.]+)+)(:\d+)?([/?#]\S*)?$/i

/**
 * The link of what a participant typed as an address: an address of a site without a scheme gets `https://`, an
 * address of mail `mailto:`. `null` when it is not a link that CoDraw opens; see {@link parseLink}.
 */
export function addressLink(text: string, origin = appOrigin()): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const address = SCHEME.test(trimmed)
    ? trimmed
    : MAIL.test(trimmed)
      ? `mailto:${trimmed}`
      : SITE.test(trimmed)
        ? `https://${trimmed}`
        : trimmed
  const link = parseLink(address, origin)
  if (!link) return null
  return link.kind === 'page' ? pageLink(link.pageId) : link.url
}

/**
 * The link to a page whose id is a key of `ids` made a link to the page with the id it maps to; any other value as it
 * is. An import of pages whose ids were taken keeps the links between them.
 */
export function movedPageLink<T extends StyleValue | undefined>(value: T, ids: ReadonlyMap<string, string>): T | string {
  if (typeof value !== 'string' || !value.trim().startsWith(PAGE_LINK_PREFIX)) return value
  const moved = ids.get(value.trim().slice(PAGE_LINK_PREFIX.length))
  return moved === undefined ? value : pageLink(moved)
}
