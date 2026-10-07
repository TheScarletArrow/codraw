import type { ShapeLink } from '../diagram/links.ts'
import type { PageInfo } from '../diagram/pages.ts'
import type { LinkableBoard } from './boards.ts'

/** How long a message about a link that leads nowhere stays, in milliseconds. */
export const LINK_MESSAGE_DURATION = 5_000

/** What following a link that leads nowhere says over the canvas. */
export const LINK_MESSAGES = {
  page: 'Страница, на которую ведёт ссылка, удалена',
  board: 'Доска, на которую ведёт ссылка, не найдена',
  unsafe: 'Эта ссылка не открывается: CoDraw открывает только адреса http, https и mailto',
} as const

/** What a link leads to, in words: the page or the board by its name, an address as it is. */
export function linkTarget(link: ShapeLink, pages: readonly PageInfo[], boards: readonly LinkableBoard[] | undefined): string {
  switch (link.kind) {
    case 'page': {
      const page = pages.find((candidate) => candidate.id === link.pageId)
      return page ? `Страница «${page.name}»` : 'Удалённая страница'
    }
    case 'board': {
      const board = boards?.find((candidate) => candidate.id === link.boardId)
      return board ? `Доска «${board.title}»` : 'Другая доска'
    }
    case 'url':
      return link.url.startsWith('mailto:') ? link.url.slice('mailto:'.length) : link.url
  }
}

/** Why the window «Ссылка» does not take what was chosen. */
export const LINK_ERRORS = {
  address: 'Адрес должен начинаться с http://, https:// или mailto:',
  empty: 'Введите адрес',
  board: 'Выберите доску',
  page: 'Выберите страницу',
} as const
