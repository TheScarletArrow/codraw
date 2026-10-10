import type { VersionAuthor } from '../api/versions.ts'
import { participantColor } from './identity.ts'
import { versionMessages as m } from './versions.messages.ts'

/** Authors shown with their marks and names; the others are counted. */
const SHOWN_AUTHORS = 3

/**
 * Who changed the board in a version, compactly: the first authors as their avatars, or the first letters of their names,
 * in the colours they have as participants, with their names, and «+N» for the rest. All names are in the tooltip and
 * for screen readers.
 */
export function VersionAuthors({ authors }: { authors: VersionAuthor[] }) {
  const shown = authors.slice(0, SHOWN_AUTHORS)
  const rest = authors.length - shown.length
  const label = m.changedBy(authors.map((author) => author.name).join(', '))
  return (
    <span title={label} className="flex min-w-0 text-xs text-muted-foreground">
      <span className="sr-only">{label}</span>
      <span aria-hidden className="flex min-w-0 items-center gap-1.5">
        <span className="flex shrink-0 -space-x-1">
          {shown.map((author) => (
            <AuthorMark key={author.id} author={author} />
          ))}
        </span>
        <span className="truncate">{shown.map((author) => author.name).join(', ')}</span>
        {rest > 0 && <span className="shrink-0 font-medium">+{rest}</span>}
      </span>
    </span>
  )
}

/** The avatar of a participant who changed the board, or the first letter of their name, in their colour. */
export function AuthorMark({ author }: { author: VersionAuthor }) {
  const color = participantColor(author.id)
  if (author.avatarUrl) {
    return (
      <img
        src={author.avatarUrl}
        alt=""
        data-testid="version-author"
        className="size-4 rounded-full ring-1 ring-background"
        style={{ outline: `1px solid ${color}` }}
      />
    )
  }
  return (
    <span
      data-testid="version-author"
      className="flex size-4 items-center justify-center rounded-full text-[0.625rem] leading-none font-semibold text-white ring-1 ring-background"
      style={{ backgroundColor: color }}
    >
      {Array.from(author.name.trim())[0]?.toUpperCase() ?? '?'}
    </span>
  )
}
