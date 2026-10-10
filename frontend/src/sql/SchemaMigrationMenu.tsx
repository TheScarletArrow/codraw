import { DatabaseZap } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { BoardSnapshot } from '../diagram/diff.ts'
import { downloadBlob, fileName } from '../lib/download.ts'
import { DB_VENDORS, type DbVendorId } from './dbVendors.ts'
import { DIALECTS } from './dialects.ts'
import { boardSchema, defaultDialect, planMigration, type BoardSchema } from './migration.ts'
import {
  flywayFiles,
  isFlywayVersion,
  liquibaseChangelog,
  migrationSql,
  migrationSummary,
  type MigrationFormat,
  type MigrationStates,
} from './migrationFiles.ts'
import type { SqlFile } from './parseSql.ts'
import { schemaMigrationMessages as m } from './SchemaMigrationMenu.messages.ts'

/** Two states of a board: the schema as the database has it, and as it is to be. */
export interface MigrationSources {
  from: BoardSnapshot
  to: BoardSnapshot
}

interface SchemaMigrationMenuProps {
  /** Reads both states of the board, when the window opens; `null` while they are not there. */
  read: () => MigrationSources | null
  /** How people call the states, for the files: «версия от …» and «текущая доска». */
  states: MigrationStates
  /** The files of SQL and Liquibase are named after the board. */
  boardTitle: string
  disabled?: boolean
}

const FORMATS: { id: MigrationFormat; label: string }[] = [
  { id: 'sql', label: 'SQL' },
  { id: 'flyway', label: 'Flyway' },
  { id: 'liquibase', label: 'Liquibase' },
]

type Message = 'copied' | 'copy-failed'

const FIELD = 'h-8 min-w-0 rounded-md border bg-background px-2 text-sm text-foreground'

/**
 * «Миграция SQL»: the migration of the schema of the database between two states of the board for a database, as SQL,
 * a pair of Flyway or a changeset of Liquibase, to copy or download. The states are read when the window opens, so
 * that what is copied does not change under the hand of whoever copies it; nothing on the board changes.
 */
export function SchemaMigrationMenu({ read, states, boardTitle, disabled = false }: SchemaMigrationMenuProps) {
  const [open, setOpen] = useState(false)
  const [schemas, setSchemas] = useState<{ from: BoardSchema; to: BoardSchema } | null>(null)
  // `null` takes the database of the tables.
  const [vendor, setVendor] = useState<DbVendorId | null>(null)
  const [format, setFormat] = useState<MigrationFormat>('sql')
  const [version, setVersion] = useState('1')
  const [description, setDescription] = useState('update_schema')
  const [author, setAuthor] = useState('codraw')
  const [changeset, setChangeset] = useState('1')
  const [message, setMessage] = useState<Message | null>(null)
  const versionHint = useId()
  const formatName = useId()

  const openChange = (next: boolean) => {
    if (next) {
      const sources = read()
      setSchemas(sources && { from: boardSchema(sources.from), to: boardSchema(sources.to) })
    }
    setMessage(null)
    setOpen(next)
  }

  const chosen = vendor ?? (schemas ? defaultDialect(schemas.from, schemas.to) : 'postgresql')
  const migration = useMemo(() => {
    if (!schemas) return null
    const dialect = DIALECTS[chosen]
    // Back is the same generator from the later state to the earlier one: the names of its constraints are the same.
    return {
      forward: planMigration(schemas.from, schemas.to, dialect),
      backward: planMigration(schemas.to, schemas.from, dialect),
    }
  }, [schemas, chosen])
  const summary = migration && migrationSummary(migration.forward)
  const validVersion = isFlywayVersion(version)

  const files: SqlFile[] = (() => {
    if (!migration || summary?.changes === 0) return []
    const { forward, backward } = migration
    if (format === 'flyway') return validVersion ? flywayFiles(forward, backward, { version, description }, states) : []
    if (format === 'liquibase') {
      return [
        {
          name: fileName(`${boardTitle} — changelog`, 'sql'),
          text: liquibaseChangelog(forward, backward, { author, id: changeset }, states),
        },
      ]
    }
    return [{ name: fileName(m.fileName(boardTitle), 'sql'), text: migrationSql(forward, states) }]
  })()

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setMessage('copied')
    } catch {
      setMessage('copy-failed')
    }
  }

  const download = () => files.forEach((file) => downloadBlob(new Blob([file.text], { type: 'application/sql' }), file.name))

  const edit = (set: (value: string) => void) => (event: { target: { value: string } }) => {
    set(event.target.value)
    setMessage(null)
  }

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          title={m.buttonTitle}
        >
          <DatabaseZap />
          {m.title}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={m.title}
        className="flex max-h-[80vh] w-[40rem] max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto"
      >
        <div>
          <h2 className="text-sm font-semibold">{m.title}</h2>
          <p className="text-xs text-muted-foreground">
            {m.fromTo(states.from, states.to)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            {m.database}
            <select
              aria-label={m.database}
              className={FIELD}
              value={chosen}
              onChange={(event) => {
                setVendor(event.target.value as DbVendorId)
                setMessage(null)
              }}
            >
              {DB_VENDORS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex items-center gap-3">
            <legend className="sr-only">{m.format}</legend>
            <span aria-hidden="true">{m.format}</span>
            {FORMATS.map((option) => (
              <label key={option.id} className="flex items-center gap-1">
                <input
                  type="radio"
                  name={formatName}
                  value={option.id}
                  checked={format === option.id}
                  onChange={() => {
                    setFormat(option.id)
                    setMessage(null)
                  }}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        </div>
        {format === 'flyway' && (
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              {m.version}
              <input
                className={`${FIELD} w-28`}
                value={version}
                aria-invalid={!validVersion}
                aria-describedby={validVersion ? undefined : versionHint}
                onChange={edit(setVersion)}
              />
            </label>
            <label className="flex flex-1 items-center gap-2">
              {m.description}
              <input className={`${FIELD} flex-1`} value={description} onChange={edit(setDescription)} />
            </label>
          </div>
        )}
        {format === 'liquibase' && (
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <label className="flex flex-1 items-center gap-2">
              {m.author}
              <input className={`${FIELD} flex-1`} value={author} onChange={edit(setAuthor)} />
            </label>
            <label className="flex items-center gap-2">
              ID changeset
              <input className={`${FIELD} w-28`} value={changeset} onChange={edit(setChangeset)} />
            </label>
          </div>
        )}
        {!summary ? (
          <p className="text-sm text-muted-foreground">{m.loading}</p>
        ) : summary.changes === 0 ? (
          <p className="text-sm text-muted-foreground">{m.unchanged}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {m.summary(summary.changes, summary.dangerous)}
              {summary.unsupported > 0 && m.unsupported(DIALECTS[chosen].label, summary.unsupported)}
            </p>
            {format === 'flyway' && !validVersion && (
              <p id={versionHint} role="alert" className="text-sm text-destructive">
                {m.badVersion}
              </p>
            )}
            {files.map((file) => (
              <section key={file.name} aria-label={file.name} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{file.name}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void copy(file.text)}>
                    {m.copy}
                  </Button>
                </div>
                <textarea
                  readOnly
                  aria-label={m.fileText(file.name)}
                  rows={Math.min(14, file.text.split('\n').length)}
                  spellCheck={false}
                  wrap="off"
                  className="w-full resize-y rounded-md border bg-muted/40 px-2 py-1.5 font-mono text-xs"
                  value={file.text}
                />
              </section>
            ))}
            {files.length > 0 && (
              <Button type="button" size="sm" className="self-start" onClick={download}>
                {files.length > 1 ? m.downloadBoth : m.download}
              </Button>
            )}
          </>
        )}
        {message && (
          <p role={message === 'copy-failed' ? 'alert' : undefined} aria-live="polite" className="text-sm text-muted-foreground">
            {message === 'copied' ? m.copied : m.copyFailed}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
