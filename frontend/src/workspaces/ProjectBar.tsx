import { Ellipsis, FolderPlus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { WorkspaceProject } from '../api/workspaces.ts'
import { TitleInput } from '../board/TitleInput.tsx'
import { ALL_PROJECTS, PROJECT_NAME_MAX_LENGTH, type ProjectFilter } from './workspaces.ts'

interface ProjectBarProps {
  projects: WorkspaceProject[]
  selected: ProjectFilter
  onSelect: (filter: ProjectFilter) => void
  /** Those who manage the workspace create, rename and delete projects; without it the bar only chooses. */
  manage?: {
    onCreate: (name: string) => void
    onRename: (id: string, name: string) => void
    /** Called once the user has confirmed the deletion. */
    onDelete: (id: string) => void
  }
  /** Why the latest change of projects did not happen. */
  error?: string | null
}

const chip = (pressed: boolean) =>
  cn('h-8 max-w-48 rounded-full px-3 font-normal', pressed && 'border-primary bg-primary/10 text-foreground')

/**
 * The projects of a workspace over its boards: «Все доски», «Без проекта» and each project choose what the page shows;
 * those who manage the workspace create a project and rename or delete the chosen one.
 */
export function ProjectBar({ projects, selected, onSelect, manage, error }: ProjectBarProps) {
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const chosen = selected.kind === 'project' ? projects.find((project) => project.id === selected.id) : undefined
  const option = (filter: ProjectFilter, label: string, key: string) => {
    const pressed =
      filter.kind === selected.kind && (filter.kind !== 'project' || (selected.kind === 'project' && filter.id === selected.id))
    return (
      <Button
        key={key}
        type="button"
        variant="outline"
        size="sm"
        aria-pressed={pressed}
        className={chip(pressed)}
        onClick={() => onSelect(filter)}
      >
        <span className="truncate">{label}</span>
      </Button>
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div role="group" aria-label="Проекты" className="flex flex-wrap items-center gap-2">
        {option(ALL_PROJECTS, 'Все доски', 'all')}
        {projects.length > 0 && option({ kind: 'none' }, 'Без проекта', 'none')}
        {projects.map((project) =>
          renaming && chosen?.id === project.id && manage ? (
            <TitleInput
              key={project.id}
              title={project.name}
              label="Название проекта"
              maxLength={PROJECT_NAME_MAX_LENGTH}
              className="h-8 w-48 px-2"
              onDone={(name) => {
                setRenaming(false)
                if (name !== null) manage.onRename(project.id, name)
              }}
            />
          ) : (
            option({ kind: 'project', id: project.id }, project.name, project.id)
          ),
        )}
        {manage && chosen && !renaming && (
          <ProjectMenu name={chosen.name} onRename={() => setRenaming(true)} onDelete={() => manage.onDelete(chosen.id)} />
        )}
        {manage &&
          (creating ? (
            <TitleInput
              title=""
              label="Новый проект"
              placeholder="Название проекта"
              maxLength={PROJECT_NAME_MAX_LENGTH}
              className="h-8 w-48 px-2"
              onDone={(name) => {
                setCreating(false)
                if (name !== null) manage.onCreate(name)
              }}
            />
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(true)}>
              <FolderPlus />
              Новый проект
            </Button>
          ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/** Menu of the chosen project: renaming it, and deleting it after a confirmation that its boards stay. */
function ProjectMenu({ name, onRename, onDelete }: { name: string; onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const item = 'justify-start font-normal'

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setConfirming(false)
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Меню проекта «${name}»`} title="Действия с проектом">
          <Ellipsis />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1" onCloseAutoFocus={(event) => event.preventDefault()}>
        {confirming ? (
          <div role="alertdialog" aria-label="Удаление проекта" className="flex flex-col gap-2 p-2">
            <p className="text-sm">Удалить проект «{name}»? Его доски останутся в пространстве без проекта.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Отмена
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => {
                  setOpen(false)
                  onDelete()
                }}
              >
                Удалить
              </Button>
            </div>
          </div>
        ) : (
          <div role="menu" aria-label={`Проект «${name}»`} className="flex flex-col">
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              size="sm"
              className={item}
              onClick={() => {
                setOpen(false)
                onRename()
              }}
            >
              Переименовать проект
            </Button>
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              size="sm"
              className={cn(item, 'text-destructive hover:text-destructive')}
              onClick={() => setConfirming(true)}
            >
              Удалить проект
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
