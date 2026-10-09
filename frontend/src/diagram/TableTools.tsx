import { Plus } from 'lucide-react'
import { useId, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { DB_VENDORS, vendorTypes, type DbVendorId } from '../sql/dbVendors.ts'
import type { DiagramEditor, SelectedField, SelectedIndex, TableBase, TableView } from './editor.ts'
import { MAX_VIEW_QUERY } from './views.ts'

interface TableToolsProps {
  editor: DiagramEditor | null
  /** The database of the selected table; `null` without one. */
  vendor: DbVendorId | null
  /** The selected field, or `null` when the table itself is selected. */
  field: SelectedField | null
  /** The selected index, or `null`. */
  index: SelectedIndex | null
  /** The selected table as to base tables. */
  base: TableBase | null
  /** The selected table as to views. */
  view: TableView | null
}

/**
 * The database, the view and the base of the selected table, a new field or index, the type and keys of the selected
 * field, and the columns of the selected index. A view has no base, and a view that is not materialized no indexes.
 */
export function TableTools({ editor, vendor, field, index, base, view }: TableToolsProps) {
  const isView = view?.view === true
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
      {view && <ViewTools editor={editor} view={view} />}
      {base && !isView && <BaseTools editor={editor} base={base} />}
      <Button type="button" variant="ghost" size="sm" onClick={() => editor?.addTableField()}>
        <Plus />
        Добавить поле
      </Button>
      {(!isView || view.materialized) && (
        <Button type="button" variant="ghost" size="sm" onClick={() => editor?.addTableIndex()}>
          <Plus />
          Добавить индекс
        </Button>
      )}
      {field && <FieldTools editor={editor} vendor={vendor} field={field} />}
      {index && (
        <>
          <span aria-hidden className="mx-1 h-5 w-px bg-border" />
          <IndexProps editor={editor} index={index} />
        </>
      )}
    </>
  )
}

/** Whether the selected table is a view, a materialized one, and the query of a view. */
function ViewTools({ editor, view }: { editor: DiagramEditor | null; view: TableView }) {
  const toggle = (pressed: boolean) => cn(pressed && 'bg-accent text-accent-foreground')
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={view.view}
        title="Представление (VIEW): столбцы запроса к таблицам; в SQL — CREATE VIEW"
        className={toggle(view.view)}
        onClick={() => editor?.setViewTable(!view.view)}
      >
        Представление
      </Button>
      {view.view && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={view.materialized}
            title="Материализованное представление: база хранит его строки, у него бывают индексы"
            className={toggle(view.materialized)}
            onClick={() => editor?.setViewMaterialized(!view.materialized)}
          >
            Материализованное
          </Button>
          <ViewQuery editor={editor} query={view.query} />
        </>
      )}
    </>
  )
}

/** The query of the selected view in a window: applied with «Применить» or Ctrl+Enter, Escape closes it unchanged. */
function ViewQuery({ editor, query }: { editor: DiagramEditor | null; query: string }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(query)
  const apply = () => {
    editor?.setViewQuery(draft)
    setOpen(false)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setDraft(query)
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" title={query || 'Запрос представления не задан'}>
          Запрос…
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label="Запрос представления" className="flex w-[32rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Запрос представления
          <textarea
            aria-label="Запрос"
            placeholder="SELECT id, email FROM users WHERE deleted_at IS NULL"
            rows={8}
            spellCheck={false}
            maxLength={MAX_VIEW_QUERY}
            className="w-full resize-y rounded-md border bg-background px-2 py-1.5 font-mono text-xs font-normal"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                apply()
              }
            }}
          />
        </label>
        <p className="text-xs text-muted-foreground">Текст после AS; в SQL — CREATE VIEW … AS запрос. Ctrl+Enter — применить.</p>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={apply}>
            Применить
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            Отмена
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** The base the selected table inherits, and whether it is a base table itself and the default one of the page. */
function BaseTools({ editor, base }: { editor: DiagramEditor | null; base: TableBase }) {
  const toggle = (pressed: boolean) => cn(pressed && 'bg-accent text-accent-foreground')
  return (
    <>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        База
        <select
          aria-label="База таблицы"
          className="h-8 max-w-40 rounded-md border bg-background px-2 text-foreground"
          value={base.baseId ?? ''}
          onChange={(event) => editor?.setTableBase(event.target.value || null)}
        >
          <option value="">—</option>
          {base.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={base.base}
        title="Базовая таблица: шаблон полей, которые наследуют другие таблицы; в SQL её нет"
        className={toggle(base.base)}
        onClick={() => editor?.setBaseTable(!base.base)}
      >
        Базовая
      </Button>
      {base.base && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={base.defaultBase}
          title="Новые таблицы страницы получают эту базу"
          className={toggle(base.defaultBase)}
          onClick={() => editor?.setDefaultBase(!base.defaultBase)}
        >
          По умолчанию
        </Button>
      )}
    </>
  )
}

function FieldTools({ editor, vendor, field }: { editor: DiagramEditor | null; vendor: DbVendorId | null; field: SelectedField }) {
  return (
    <>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      {field.inheritedFrom !== null ? (
        // An inherited field is edited in its base table.
        <span className="text-sm whitespace-nowrap text-muted-foreground">{`Из ${field.inheritedFrom}`}</span>
      ) : (
        <FieldProps editor={editor} vendor={vendor} field={field} />
      )}
    </>
  )
}

/** The type, nullability and keys of the selected field, the type alone of a column of a view: on the toolbar and next to the field. */
export function FieldProps({ editor, vendor, field }: { editor: DiagramEditor | null; vendor: DbVendorId | null; field: SelectedField }) {
  const toggle = (pressed: boolean) => cn(pressed && 'bg-accent text-accent-foreground')
  const type = (
    <TypeField
      value={field.type}
      types={vendorTypes(DB_VENDORS.find((option) => option.id === vendor) ?? null)}
      onCommit={(type) => editor?.setFieldProps({ type })}
    />
  )
  if (field.inView) return type
  return (
    <>
      {type}
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

/** The columns and the uniqueness of the selected index: on the toolbar and next to the index. */
export function IndexProps({ editor, index }: { editor: DiagramEditor | null; index: SelectedIndex }) {
  return (
    <>
      <ColumnsField value={index.columns} onCommit={(columns) => editor?.setIndexProps({ columns })} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={index.unique}
        title="Уникальный индекс"
        className={cn('px-2 font-mono text-xs', index.unique && 'bg-accent text-accent-foreground')}
        onClick={() => editor?.setIndexProps({ unique: !index.unique })}
      >
        UNIQUE
      </Button>
    </>
  )
}

/** The columns of an index, applied on Enter or when the field loses focus; Escape brings the current ones back. */
function ColumnsField({ value, onCommit }: { value: string; onCommit: (columns: string) => void }) {
  // What the participant is typing; `null` while the field shows the current columns.
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    setDraft(null)
    if (draft !== null && draft.trim() !== value) onCommit(draft)
  }
  return (
    <input
      aria-label="Столбцы индекса"
      title="Столбцы и выражения индекса через запятую"
      placeholder="Столбцы"
      spellCheck={false}
      value={draft ?? value}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
        } else if (event.key === 'Escape') {
          setDraft(null)
        }
      }}
      className="h-8 w-48 min-w-0 shrink-0 rounded-md border bg-background px-2 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
    />
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
