import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { History, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SIDE_PANEL_CLASS } from '@/lib/panels'
import {
  fetchVersions,
  renameVersion,
  saveVersion,
  VERSION_NAME_MAX_LENGTH,
  type BoardVersion,
} from '../api/versions.ts'
import { TitleInput } from './TitleInput.tsx'
import { VersionAuthors } from './VersionAuthors.tsx'
import { versionsKey, versionTimeFormat } from './versions.ts'
import { versionMessages as m } from './versions.messages.ts'

interface VersionHistoryProps {
  boardId: string
  /** The live board document; saving a version sends its state. */
  document: Y.Doc | null
  selectedId: string | null
  onSelect: (version: BoardVersion) => void
  onClose: () => void
}

/**
 * The versions of a board for whoever edits it: the list, most recent first, with the names and the authors of the
 * versions, renaming them, and saving the current state as a version with a name if one is given.
 */
export function VersionHistory({ boardId, document, selectedId, onSelect, onClose }: VersionHistoryProps) {
  const queryClient = useQueryClient()
  const versions = useQuery({ queryKey: versionsKey(boardId), queryFn: () => fetchVersions(boardId) })
  const [name, setName] = useState('')
  const save = useMutation({
    mutationFn: ({ doc, name }: { doc: Y.Doc; name: string }) =>
      saveVersion(boardId, Y.encodeStateAsUpdate(doc), 'manual', name.trim() || undefined),
    onSuccess: () => {
      setName('')
      return queryClient.invalidateQueries({ queryKey: versionsKey(boardId), exact: true })
    },
  })
  const [renaming, setRenaming] = useState<string | null>(null)
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string | null }) => renameVersion(boardId, id, name),
    onSuccess: (renamed) =>
      queryClient.setQueryData<BoardVersion[]>(versionsKey(boardId), (list) =>
        list?.map((version) => (version.id === renamed.id ? renamed : version)),
      ),
  })

  return (
    <aside aria-label={m.history} className={cn(SIDE_PANEL_CLASS, 'w-72')}>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <History className="size-4 text-muted-foreground" />
        <h3 className="flex-1 text-sm font-semibold">{m.history}</h3>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={m.closeHistory} onClick={onClose}>
          <X />
        </Button>
      </div>
      <form
        className="flex flex-col gap-2 border-b p-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (document) save.mutate({ doc: document, name })
        }}
      >
        <input
          aria-label={m.name}
          placeholder={m.namePlaceholder}
          value={name}
          maxLength={VERSION_NAME_MAX_LENGTH}
          className="h-8 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" variant="outline" size="sm" disabled={!document || save.isPending}>
          {m.save}
        </Button>
        {save.isError && (
          <p role="alert" className="text-sm text-destructive">
            {m.saveFailed}
          </p>
        )}
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {versions.isPending && <p className="p-2 text-sm text-muted-foreground">{m.loading}</p>}
        {versions.isError && (
          <p role="alert" className="p-2 text-sm text-destructive">
            {m.loadFailed}
          </p>
        )}
        {rename.isError && (
          <p role="alert" className="p-2 text-sm text-destructive">
            {m.renameFailed}
          </p>
        )}
        {versions.data?.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">
            {m.none}
          </p>
        )}
        {versions.data && versions.data.length > 0 && (
          <ul aria-label={m.list} className="flex flex-col">
            {versions.data.map((version) => {
              const time = versionTimeFormat().format(new Date(version.createdAt))
              const reason = m.reasons[version.reason]
              // The name being saved shows at once.
              const name = rename.isPending && rename.variables.id === version.id ? rename.variables.name : version.name
              return (
                <li key={version.id} className="relative">
                  {renaming === version.id ? (
                    <div className="flex flex-col gap-0.5 rounded-md bg-accent px-2 py-1.5">
                      <TitleInput
                        title={version.name ?? ''}
                        label={m.newName}
                        placeholder={reason}
                        maxLength={VERSION_NAME_MAX_LENGTH}
                        allowEmpty
                        className="text-sm"
                        onDone={(next) => {
                          setRenaming(null)
                          if (next !== null) rename.mutate({ id: version.id, name: next || null })
                        }}
                      />
                      <time dateTime={version.createdAt} className="text-xs text-muted-foreground">
                        {time}
                      </time>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-pressed={version.id === selectedId}
                        className={cn(
                          'flex w-full flex-col gap-0.5 rounded-md py-1.5 pr-9 pl-2 text-left hover:bg-accent',
                          version.id === selectedId && 'bg-accent',
                        )}
                        onClick={() => onSelect(version)}
                      >
                        <span className="truncate text-sm font-medium">{name ?? reason}</span>
                        <span className="text-xs text-muted-foreground">
                          <time dateTime={version.createdAt}>{time}</time>
                          {name && ` · ${reason}`}
                        </span>
                        {version.authors.length > 0 && <VersionAuthors authors={version.authors} />}
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={m.rename}
                        title={m.rename}
                        className="absolute top-1 right-1 size-7 text-muted-foreground"
                        onClick={() => setRenaming(version.id)}
                      >
                        <Pencil />
                      </Button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
