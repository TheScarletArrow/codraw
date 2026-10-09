import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Decision, DecisionContent, DecisionStatus } from '../api/decisions.ts'
import { DECISION_STATUSES, decisionCode, SECTIONS, STATUS_LABELS } from './decisions.ts'

const fieldClass = 'w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground'

interface DecisionFormProps {
  /** What the form starts with. */
  initial: DecisionContent
  /** The decision that the form changes, which cannot supersede itself; `null` for a new one. */
  decisionId: string | null
  /** The decisions of the board, of which another one supersedes a superseded decision. */
  decisions: readonly Decision[]
  label: string
  submitLabel: string
  pending: boolean
  error: string | null
  /** Shown under the title, e.g. the elements a new decision is about. */
  children?: ReactNode
  onSubmit: (content: DecisionContent) => void
  onCancel: () => void
}

/**
 * A decision as MADR has it: the title, the status, with the decision that superseded it for a superseded one, the day
 * it was decided on, and the sections, which are text of Markdown.
 */
export function DecisionForm({
  initial,
  decisionId,
  decisions,
  label,
  submitLabel,
  pending,
  error,
  children,
  onSubmit,
  onCancel,
}: DecisionFormProps) {
  const id = useId()
  const [content, setContent] = useState(initial)
  const change = (changes: Partial<DecisionContent>) => setContent((current) => ({ ...current, ...changes }))
  const successors = decisions.filter((decision) => decision.id !== decisionId)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (content.title.trim() === '' || pending) return
    onSubmit({ ...content, supersededBy: content.status === 'superseded' ? content.supersededBy : null })
  }

  return (
    <form
      aria-label={label}
      className="flex flex-col gap-2"
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
    >
      <Field label="Название" htmlFor={`${id}-title`}>
        <input
          id={`${id}-title`}
          type="text"
          required
          maxLength={200}
          autoFocus
          autoComplete="off"
          value={content.title}
          className={cn(fieldClass, 'h-8')}
          onChange={(event) => change({ title: event.target.value })}
        />
      </Field>
      {children}
      <div className="flex gap-2">
        <Field label="Статус" htmlFor={`${id}-status`} className="flex-1">
          <select
            id={`${id}-status`}
            value={content.status}
            className={cn(fieldClass, 'h-8')}
            onChange={(event) => change({ status: event.target.value as DecisionStatus })}
          >
            {DECISION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Дата" htmlFor={`${id}-date`} className="flex-1">
          <input
            id={`${id}-date`}
            type="date"
            required
            value={content.decidedOn}
            className={cn(fieldClass, 'h-8')}
            onChange={(event) => change({ decidedOn: event.target.value })}
          />
        </Field>
      </div>
      {content.status === 'superseded' && (
        <Field label="Заменено решением" htmlFor={`${id}-successor`}>
          <select
            id={`${id}-successor`}
            value={content.supersededBy ?? ''}
            className={cn(fieldClass, 'h-8')}
            onChange={(event) => change({ supersededBy: event.target.value || null })}
          >
            <option value="">Не указано</option>
            {successors.map((decision) => (
              <option key={decision.id} value={decision.id}>
                {decisionCode(decision.number)} {decision.title}
              </option>
            ))}
          </select>
        </Field>
      )}
      {SECTIONS.map(([key, title]) => (
        <Field key={key} label={title} htmlFor={`${id}-${key}`}>
          <textarea
            id={`${id}-${key}`}
            rows={3}
            maxLength={20000}
            value={content[key]}
            placeholder="Markdown"
            className={cn(fieldClass, 'resize-y py-1')}
            onChange={(event) => change({ [key]: event.target.value })}
          />
        </Field>
      ))}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="submit" size="sm" disabled={pending || content.title.trim() === ''}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string
  htmlFor: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
