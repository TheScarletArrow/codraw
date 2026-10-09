import { ChevronDown, ChevronRight, Download, Link2, Pencil, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Decision, DecisionContent, DecisionElement } from '../api/decisions.ts'
import { ConfirmedAction } from '../board/ConfirmedAction.tsx'
import type { StatusItem } from '../board/statusList.ts'
import type { CellInfo } from '../comments/threads.ts'
import { DecisionForm } from './DecisionForm.tsx'
import { contentOf, decisionCode, formatDay, isAbout, SECTIONS, statusText, withElements } from './decisions.ts'

const STATUS_COLORS: Record<Decision['status'], string> = {
  proposed: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  accepted: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100',
  rejected: 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100',
  superseded: 'bg-muted text-muted-foreground',
}

/** What may be done with a decision; each returns once the board has it, or fails. */
export interface DecisionActions {
  update(decision: Decision, content: DecisionContent): Promise<unknown>
  link(decision: Decision, elements: DecisionElement[]): Promise<unknown>
  remove(decision: Decision): Promise<unknown>
  download(decision: Decision): void
}

interface DecisionCardProps {
  decision: Decision
  decisions: readonly Decision[]
  expanded: boolean
  /** The decision the participant came to, e.g. from a notification. */
  highlighted: boolean
  canEdit: boolean
  /** The element of a page as the board document has it; `null` when the page no longer has it. */
  cellInfo: (pageId: string, cellId: string) => CellInfo | null
  pages: readonly { id: string; name: string }[]
  /** The elements selected on the canvas, which the decision may be linked to. */
  selection: readonly DecisionElement[]
  /** Elements marked «Нужно ревью» that the decision may be about too. */
  suggestions: readonly StatusItem[]
  actions: DecisionActions
  /** The discussion of the decision, shown with its details. */
  discussion: ReactNode
  onToggle: () => void
  onShowElement: (element: DecisionElement) => void
}

/**
 * A decision of the board: its number, title, status, day and author; opened, its sections, the elements it is about,
 * which a participant who edits links and unlinks, and its discussion.
 */
export function DecisionCard({
  decision,
  decisions,
  expanded,
  highlighted,
  canEdit,
  cellInfo,
  pages,
  selection,
  suggestions,
  actions,
  discussion,
  onToggle,
  onShowElement,
}: DecisionCardProps) {
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const code = decisionCode(decision.number)
  const attempt = (action: () => Promise<unknown>, failure: string) => {
    setPending(true)
    return action().then(
      () => {
        setPending(false)
        setError(null)
        return true
      },
      () => {
        setPending(false)
        setError(failure)
        return false
      },
    )
  }
  const unlinked = selection.filter((element) => !isAbout(decision, element))
  const elementTitle = (element: DecisionElement) => {
    const page = pages.find((candidate) => candidate.id === element.pageId)
    if (!page) return { label: 'Страница удалена', page: null, deleted: true }
    const cell = cellInfo(element.pageId, element.cellId)
    if (!cell) return { label: 'Элемент удалён', page: page.name, deleted: true }
    return { label: cell.label !== '' ? `«${cell.label}»` : 'Без подписи', page: page.name, deleted: false }
  }

  return (
    <article
      aria-label={`${code} ${decision.title}`}
      data-decision={decision.id}
      aria-current={highlighted || undefined}
      className={cn('flex flex-col gap-2 rounded-md border p-2', highlighted && 'ring-2 ring-primary')}
    >
      <button
        type="button"
        aria-expanded={expanded}
        className="flex min-w-0 items-start gap-1 rounded text-left hover:bg-accent"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown aria-hidden className="mt-0.5 size-4 shrink-0" />
        ) : (
          <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-mono text-xs text-muted-foreground">{code}</span>{' '}
          <span className="font-medium">{decision.title}</span>
        </span>
      </button>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-muted-foreground">
        <span className={cn('rounded px-1.5 py-0.5 font-medium', STATUS_COLORS[decision.status])}>
          {statusText(decision, decisions)}
        </span>
        <span>{formatDay(decision.decidedOn)}</span>
        {decision.author && <span>{decision.author.name}</span>}
        {decision.elements.length > 0 && <span>Элементов: {decision.elements.length}</span>}
      </p>
      {expanded && editing && (
        <DecisionForm
          initial={contentOf(decision)}
          decisionId={decision.id}
          decisions={decisions}
          label={`Изменить решение ${code}`}
          submitLabel="Сохранить"
          pending={pending}
          error={error}
          onSubmit={(content) =>
            void attempt(() => actions.update(decision, content), 'Не удалось сохранить решение').then(
              (done) => done && setEditing(false),
            )
          }
          onCancel={() => {
            setEditing(false)
            setError(null)
          }}
        />
      )}
      {expanded && !editing && (
        <>
          {SECTIONS.map(
            ([key, title]) =>
              decision[key] !== '' && (
                <section key={key} aria-label={title} className="flex flex-col gap-0.5 px-1">
                  <h5 className="text-xs font-medium text-muted-foreground">{title}</h5>
                  <p className="text-sm break-words whitespace-pre-wrap">{decision[key]}</p>
                </section>
              ),
          )}
          <section aria-label="Элементы" className="flex flex-col gap-1 px-1">
            <h5 className="text-xs font-medium text-muted-foreground">Элементы</h5>
            {decision.elements.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Не привязано ни к одному элементу.{canEdit && ' Выделите элементы на холсте и нажмите «Привязать».'}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {decision.elements.map((element) => {
                const title = elementTitle(element)
                return (
                  <li key={`${element.pageId}:${element.cellId}`} className="flex items-center gap-1">
                    <button
                      type="button"
                      title={title.page ? `Показать на странице «${title.page}»` : undefined}
                      disabled={title.deleted}
                      className={cn(
                        'min-w-0 flex-1 truncate rounded px-1 text-left text-xs hover:bg-accent disabled:hover:bg-transparent',
                        title.deleted && 'text-muted-foreground italic',
                      )}
                      onClick={() => onShowElement(element)}
                    >
                      {title.label}
                      {/* A space of its own, so that the name is «"Очередь" · Обзор», not «"Очередь"· Обзор». */}
                      {title.page && ' '}
                      {title.page && <span className="text-muted-foreground">· {title.page}</span>}
                    </button>
                    {canEdit && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Отвязать ${title.deleted ? 'удалённый элемент' : title.label}`}
                        disabled={pending}
                        onClick={() =>
                          void attempt(
                            () =>
                              actions.link(
                                decision,
                                decision.elements.filter(
                                  (other) => other.pageId !== element.pageId || other.cellId !== element.cellId,
                                ),
                              ),
                            'Не удалось отвязать элемент',
                          )
                        }
                      >
                        <X />
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
            {canEdit && unlinked.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  void attempt(
                    () => actions.link(decision, withElements(decision.elements, unlinked)),
                    'Не удалось привязать элементы',
                  )
                }
              >
                <Link2 />
                Привязать выделенные ({unlinked.length})
              </Button>
            )}
            {canEdit && suggestions.length > 0 && (
              <div role="group" aria-label="Ждут ревью" className="flex flex-col gap-1 rounded-md bg-muted/60 p-1.5">
                <p className="text-xs text-muted-foreground">Ждут ревью — может быть, решение и о них:</p>
                {suggestions.map((item) => (
                  <div key={`${item.pageId}:${item.cellId}`} className="flex items-center gap-1">
                    <span className="min-w-0 flex-1 truncate text-xs">
                      «{item.title}» <span className="text-muted-foreground">· {item.pageName}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-xs"
                      aria-label={`Привязать «${item.title}»`}
                      disabled={pending}
                      onClick={() =>
                        void attempt(
                          () =>
                            actions.link(decision, withElements(decision.elements, [{ pageId: item.pageId, cellId: item.cellId }])),
                          'Не удалось привязать элемент',
                        )
                      }
                    >
                      Привязать
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
          {error && (
            <p role="alert" className="px-1 text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => actions.download(decision)}>
              <Download />
              Скачать .md
            </Button>
            {canEdit && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Изменить решение ${code}`}
                  onClick={() => setEditing(true)}
                >
                  <Pencil />
                  Изменить
                </Button>
                <ConfirmedAction
                  label="Удалить"
                  title={`Удалить решение ${code}`}
                  confirmLabel="Удалить"
                  variant="ghost"
                  disabled={pending}
                  onConfirm={() => void attempt(() => actions.remove(decision), 'Не удалось удалить решение')}
                >
                  Решение {code} удалится вместе с обсуждением; решения, которые оно заменило, перестанут на него ссылаться.
                </ConfirmedAction>
              </>
            )}
          </div>
          {discussion}
        </>
      )}
    </article>
  )
}
