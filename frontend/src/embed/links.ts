import type { Embed } from '../api/embed.ts'

/** Query key of the live image of a board. */
export const embedKey = (boardId: string) => ['boards', boardId, 'embed'] as const

/** The address of the image as other sites embed it. */
export const embedUrl = (embed: Embed, origin = window.location.origin) => new URL(embed.path, origin).toString()

/** The image in Markdown, e.g. for a README: the title of the board is its alternative text. */
export const embedMarkdown = (embed: Embed, title: string, origin?: string) =>
  `![${title.replace(/[[\]\\]/g, '\\$&')}](${embedUrl(embed, origin)})`
