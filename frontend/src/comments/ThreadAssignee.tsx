import { Check, Search, UserPlus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Person } from '../api/comments.ts'
import { Avatar } from '../board/MembersSection.tsx'
import { commentsMessages as m } from './messages.ts'
import { suggestPeople } from './threads.ts'

interface AssigneePickerProps {
  /** Who may be assigned: those whom comments may mention. */
  people: Person[]
  assignee: Person | null
  onAssign: (person: Person) => Promise<unknown>
  /** The button that opens the picker. */
  children: ReactNode
}

/** «Назначить ответственного»: the participants of the board, found by the first letters of a name. */
function AssigneePicker({ people, assignee, onAssign, children }: AssigneePickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const found = suggestPeople(people, query.trim(), people.length)
  const choose = (person: Person) => {
    setOpen(false)
    // The card of the thread tells a failure.
    if (person.id !== assignee?.id) void onAssign(person).catch(() => {})
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setQuery('')
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" aria-label={m.assignResponsible} className="flex w-64 flex-col gap-2 p-2">
        <label className="relative flex items-center">
          <Search aria-hidden className="pointer-events-none absolute left-2 size-4 text-muted-foreground" />
          <input
            type="search"
            aria-label={m.findMember}
            placeholder={m.findMember}
            className="h-8 w-full rounded-md border bg-background pr-2 pl-8 text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && found[0]) {
                event.preventDefault()
                choose(found[0])
              }
            }}
          />
        </label>
        {found.length > 0 ? (
          <div role="group" aria-label={m.boardMembers} className="flex max-h-60 flex-col gap-0.5 overflow-y-auto">
            {found.map((person) => (
              <button
                key={person.id}
                type="button"
                aria-current={person.id === assignee?.id || undefined}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent"
                onClick={() => choose(person)}
              >
                <Avatar person={person} className="size-5" />
                <span className="min-w-0 flex-1 truncate">{person.name}</span>
                {person.id === assignee?.id && <Check aria-hidden className="size-4 text-primary" />}
              </button>
            ))}
          </div>
        ) : (
          <p className="px-2 text-sm text-muted-foreground">{m.nobodyFound}</p>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** «Назначить» for a thread without an assignee, in the header of its card. */
export function AssignButton({ people, onAssign }: { people: Person[]; onAssign: (person: Person) => Promise<unknown> }) {
  return (
    <AssigneePicker people={people} assignee={null} onAssign={onAssign}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={m.assign}
        title={m.assignResponsible}
        className="size-6 text-muted-foreground"
      >
        <UserPlus />
      </Button>
    </AssigneePicker>
  )
}

interface ThreadAssigneeProps {
  assignee: Person
  people: Person[]
  /** Assigns the thread to another person, or to nobody. */
  onAssign: (person: Person | null) => Promise<unknown>
}

/** The assignee of a thread: their avatar and name, which assign another, and «Снять». */
export function ThreadAssignee({ assignee, people, onAssign }: ThreadAssigneeProps) {
  return (
    <div className="flex items-center gap-1 px-1 text-xs">
      <span className="text-muted-foreground">{m.assignee}</span>
      <AssigneePicker people={people} assignee={assignee} onAssign={onAssign}>
        <button
          type="button"
          title={m.assignAnother}
          className="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 font-medium hover:bg-accent"
        >
          <Avatar person={assignee} className="size-4 text-[0.6rem]" />
          <span className="truncate">{assignee.name}</span>
        </button>
      </AssigneePicker>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto h-6 px-1.5 text-xs"
        onClick={() => void onAssign(null).catch(() => {})}
      >
        {m.unassign}
      </Button>
    </div>
  )
}
