import { Plus } from 'lucide-react'
import { useId, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DB_VENDORS, vendorTypes, type DbVendorId } from '../sql/dbVendors.ts'
import type { DiagramEditor, SelectedField } from './editor.ts'

interface TableToolsProps {
  editor: DiagramEditor | null
  /** The database of the selected table; `null` without one. */
  vendor: DbVendorId | null
  /** The selected field, or `null` when the table itself is selected. */
  field: SelectedField | null
}

/** The database of the selected table, a new field, and the type and keys of the selected field. */
export function TableTools({ editor, vendor, field }: TableToolsProps) {
  return (
    <>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        СУБД
        <select
          aria-label="СУБД таблицы"
          className="h-8 rounded-md border bg-background px-2 text-foreground"
          value={vendor ?? ''}
          onChange={(event) => editor?.setTableVendor(event.target.value as DbVendorId)}
        >
          {vendor === null && <option value="">—</option>}
          {DB_VENDORS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <Button type="button" variant="ghost" size="sm" onClick={() => editor?.addTableField()}>
        <Plus />
        Добавить поле
      </Button>
      {field && <FieldTools editor={editor} vendor={vendor} field={field} />}
    </>
  )
}

function FieldTools({ editor, vendor, field }: { editor: DiagramEditor | null; vendor: DbVendorId | null; field: SelectedField }) {
  const toggle = (pressed: boolean) => cn(pressed && 'bg-accent text-accent-foreground')
  return (
    <>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      <TypeField
        value={field.type}
        types={vendorTypes(DB_VENDORS.find((option) => option.id === vendor) ?? null)}
        onCommit={(type) => editor?.setFieldProps({ type })}
      />
      <div role="group" aria-label="Пустые значения" className="flex items-center">
        {[false, true].map((notNull) => (
          <Button
            key={String(notNull)}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={field.notNull === notNull}
            disabled={field.primaryKey}
            title={notNull ? 'Значение обязательно' : 'Может быть пустым'}
            className={cn('px-2 font-mono text-xs', toggle(field.notNull === notNull))}
            onClick={() => editor?.setFieldProps({ notNull })}
          >
            {notNull ? 'NOT NULL' : 'NULL'}
          </Button>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={field.primaryKey}
        title="Первичный ключ"
        className={cn('px-2 font-mono text-xs', toggle(field.primaryKey))}
        onClick={() => editor?.setFieldProps({ primaryKey: !field.primaryKey })}
      >
        PK
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={field.unique}
        title="Уникальное значение"
        className={cn('px-2 font-mono text-xs', toggle(field.unique))}
        onClick={() => editor?.setFieldProps({ unique: !field.unique })}
      >
        UNIQUE
      </Button>
    </>
  )
}

/**
 * The type of a field with the types of its database to choose from; a typed type is applied on Enter or when the field
 * loses focus, a chosen one at once. Escape brings the current type back.
 */
function TypeField({ value, types, onCommit }: { value: string; types: string[]; onCommit: (type: string) => void }) {
  const listId = useId()
  // What the participant is typing; `null` while the field shows the current type.
  const [draft, setDraft] = useState<string | null>(null)

  const commit = (type: string | null) => {
    setDraft(null)
    if (type !== null && type.trim() !== value) onCommit(type.trim())
  }
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const typed = event.target.value
    // Choosing from the list is not typing: browsers report it without an input type or as a replacement.
    const native = event.nativeEvent as InputEvent
    const chosen = !native.inputType || native.inputType === 'insertReplacementText'
    if (chosen && types.includes(typed)) commit(typed)
    else setDraft(typed)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit(draft)
    } else if (event.key === 'Escape') {
      setDraft(null)
    }
  }

  return (
    <>
      <input
        aria-label="Тип поля"
        title="Тип поля"
        list={listId}
        placeholder="Тип"
        spellCheck={false}
        value={draft ?? value}
        onChange={handleChange}
        onBlur={() => commit(draft)}
        onKeyDown={handleKeyDown}
        className="h-8 w-36 min-w-0 shrink-0 rounded-md border bg-background px-2 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <datalist id={listId}>
        {types.map((type) => (
          <option key={type} value={type} />
        ))}
      </datalist>
    </>
  )
}
