import type { ShapeLink } from '../diagram/links.ts'
import type { PageInfo } from '../diagram/pages.ts'
import type { LinkableBoard } from './boards.ts'
import { linkMessages as m } from './messages.ts'

/** How long a message about a link that leads nowhere stays, in milliseconds. */
export const LINK_MESSAGE_DURATION = 5_000

/** What a link leads to, in words: the page or the board by its name, an address as it is. */
export function linkTarget(link: ShapeLink, pages: readonly PageInfo[], boards: readonly LinkableBoard[] | undefined): string {
  switch (link.kind) {
    case 'page': {
      const page = pages.find((candidate) => candidate.id === link.pageId)
      return page ? m.pageTarget(page.name) : m.deletedPage
    }
    case 'board': {
      const board = boards?.find((candidate) => candidate.id === link.boardId)
      return board ? m.boardTarget(board.title) : m.otherBoard
    }
    case 'url':
      return link.url.startsWith('mailto:') ? link.url.slice('mailto:'.length) : link.url
  }
}
