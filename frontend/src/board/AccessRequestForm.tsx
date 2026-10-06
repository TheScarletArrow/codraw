import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MESSAGE_MAX_LENGTH, roleGivenOf } from '../api/accessRequests.ts'
import { limitOf, type MemberRole } from '../api/members.ts'
import type { AccessWish } from './accessRequests.ts'
import { counted, ROLE_LABELS } from './members.ts'

const ROLES: MemberRole[] = ['viewer', 'editor']

/** Why sending the request failed; nothing when the board gives what the user asked for, which the page shows. */
function failureOf(error: unknown): string | null {
  if (roleGivenOf(error)) return null
  const limit = limitOf(error)
  if (limit === null) return 'Не удалось отправить запрос'
  return `У доски уже ${counted(limit, ['запрос доступа', 'запроса доступа', 'запросов доступа'])} — попробуйте позже`
}

interface AccessRequestFormProps {
  /** The name of the form. */
  label: string
  /** Whether the user chooses the role, «Просмотр» or «Редактирование»; without a choice they ask for editing. */
  choice: boolean
  submitLabel: string
  pending: boolean
  /** The failure of the last attempt to send the request. */
  error: unknown
  onSubmit: (wish: AccessWish) => void
}

/** What the user asks the owner of a board for: a role, when there is a choice, and a message. */
export function AccessRequestForm({ label, choice, submitLabel, pending, error, onSubmit }: AccessRequestFormProps) {
  const id = useId()
  const [role, setRole] = useState<MemberRole>('editor')
  const [message, setMessage] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit({ role: choice ? role : 'editor', message })
  }
  const failure = error ? failureOf(error) : null

  return (
    <form aria-label={label} className="flex flex-col gap-3" onSubmit={submit}>
      {choice && (
        <fieldset className="flex flex-col gap-1" disabled={pending}>
          <legend className="mb-1 text-sm font-medium">Какой доступ нужен</legend>
          {ROLES.map((option) => (
            <label
              key={option}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent',
                role === option && 'bg-accent',
              )}
            >
              <input
                type="radio"
                name={`${id}-role`}
                value={option}
                checked={role === option}
                onChange={() => setRole(option)}
              />
              {ROLE_LABELS[option]}
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-message`} className="text-sm font-medium">
          Сообщение владельцу
        </label>
        <textarea
          id={`${id}-message`}
          value={message}
          maxLength={MESSAGE_MAX_LENGTH}
          rows={3}
          placeholder="Необязательно: кто вы и зачем вам доска"
          disabled={pending}
          className="min-h-16 rounded-md border bg-background px-2 py-1.5 text-sm"
          onChange={(event) => setMessage(event.target.value)}
        />
        <span className="self-end text-xs text-muted-foreground">
          {message.length} из {MESSAGE_MAX_LENGTH}
        </span>
      </div>
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
      <Button type="submit" size="sm" className="self-start" disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  )
}
