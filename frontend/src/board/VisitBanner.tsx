import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { VersionAuthor } from '../api/versions.ts'
import { AuthorMark } from './VersionAuthors.tsx'
import { authorNames, visitTime } from './visit.ts'

/** Authors shown with their marks; all of them are named in the text. */
const MARKED_AUTHORS = 3

interface VisitBannerProps {
  /** When the previous visit ended. */
  since: string
  /** Who changed the board since, at least one. */
  authors: VersionAuthor[]
  /** «Показать изменения» is there when the board has a version to compare with. */
  onShow: (() => void) | null
  onHide: () => void
}

/** «С вашего прошлого визита (вчера в 18:40) доску изменили Аня и Боб» above the canvas, with the way to the changes. */
export function VisitBanner({ since, authors, onShow, onHide }: VisitBannerProps) {
  const changed = authors.length === 1 ? 'изменил(а)' : 'изменили'
  return (
    <div
      role="region"
      aria-label="С прошлого визита"
      className="flex items-center gap-3 border-b bg-muted/50 px-3 py-1.5 text-sm"
    >
      <History aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span aria-hidden className="flex shrink-0 -space-x-1">
        {authors.slice(0, MARKED_AUTHORS).map((author) => (
          <AuthorMark key={author.id} author={author} />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        {`С вашего прошлого визита (${visitTime(new Date(since))}) доску ${changed} ${authorNames(authors)}`}
      </span>
      {onShow && (
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onShow}>
          Показать изменения
        </Button>
      )}
      <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={onHide}>
        Скрыть
      </Button>
    </div>
  )
}
