import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LayoutTemplate } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { createBoard } from '../api/boards.ts'
import { HttpError } from '../api/http.ts'
import { deletePersonalTemplate, fetchPersonalTemplate, fetchPersonalTemplates, PERSONAL_TEMPLATES_KEY, savePersonalTemplate, type TemplateInfo } from '../api/templates.ts'
import type { DiagramEditor } from '../diagram/editor.ts'
import { storePageImages, type ImageHost } from '../diagram/images.ts'
import { setPendingImport } from '../drawio/files.ts'
import type { DrawioPage } from '../drawio/parse.ts'
import { LINK_KEY, pageLink, parseLink } from '../diagram/links.ts'
import { templatesMessages as m } from './messages.ts'
import { personalTemplatePages, templateSnapshot } from './personalTemplates.ts'

/**
 * Private reusable diagrams, available both from the board list and alongside the editor. On the line of the tools of a
 * board the button is an icon, as its neighbours are: the line keeps its room for the tools of the canvas.
 */
export function PersonalTemplates({ document = null, editor = null, title = m.myTemplate, images = null, compact = false }: {
  document?: Y.Doc | null; editor?: DiagramEditor | null; title?: string; images?: ImageHost | null; compact?: boolean
}) {
  const navigate = useNavigate()
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const templates = useQuery({ queryKey: PERSONAL_TEMPLATES_KEY, queryFn: fetchPersonalTemplates, enabled: open })
  const [selection, setSelection] = useState<string[]>([])
  const [form, setForm] = useState(false)
  const [editing, setEditing] = useState<TemplateInfo | null>(null)
  const [replace, setReplace] = useState(false)
  const [name, setName] = useState(title)
  const [description, setDescription] = useState('')
  const [selectionOnly, setSelectionOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [inserting, setInserting] = useState<{ title: string; pages: DrawioPage[] } | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const currentEditor = useRef(editor)
  useEffect(() => { currentEditor.current = editor }, [editor])
  useEffect(() => editor?.onSelectionChange(setSelection), [editor])
  const selectedIds = () => editor?.graph?.getSelectionCells().flatMap((cell) => cell.id ? [cell.id] : []) ?? selection
  const edit = (template: TemplateInfo | null, update = false) => {
    setEditing(template); setReplace(update); setName(template?.title ?? title); setDescription(template?.description ?? ''); setSelectionOnly(false); setError(null); setForm(true)
  }
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await action() } catch (caught) {
      setError(caught instanceof HttpError ? (caught.status === 409 ? m.limitReached(caught.problem?.limit ?? null) : caught.status === 413 ? m.tooLarge : m.actionFailed) : caught instanceof Error ? caught.message : m.actionFailed)
    } finally { setBusy(false) }
  }
  const save = () => run(async () => {
    let drawio: string
    if (editing && !replace) drawio = (await fetchPersonalTemplate(editing.id)).drawio
    else {
      if (!document) throw new Error(m.boardLoading)
      drawio = await templateSnapshot(document, selectionOnly && editor ? { pageId: editor.pageId, ids: selectedIds() } : undefined)
    }
    await savePersonalTemplate({ title: name, description, drawio }, editing?.id)
    await client.invalidateQueries({ queryKey: PERSONAL_TEMPLATES_KEY })
    setForm(false)
  })
  const create = (template: TemplateInfo) => run(async () => {
    const pages = await personalTemplatePages((await fetchPersonalTemplate(template.id)).drawio)
    const board = await createBoard(template.title)
    setPendingImport(board.id, pages)
    await client.invalidateQueries({ queryKey: ['boards'] })
    setOpen(false)
    await navigate(`/boards/${board.id}`)
  })
  const prepareInsert = (template: TemplateInfo) => run(async () => {
    const pages = await personalTemplatePages((await fetchPersonalTemplate(template.id)).drawio)
    setPageIndex(0); setInserting({ title: template.title, pages })
  })
  const insert = () => run(async () => {
    const target = editor
    const page = inserting?.pages[pageIndex]
    if (!page || !target || target.readOnly) return
    if (images) await storePageImages([page], images)
    if (currentEditor.current !== target) throw new Error(m.pageChanged)
    // Only this template page is inserted; links to other template pages have no destination on this board.
    const cells = page.cells.map((cell) => {
      const style = { ...cell.style }
      const link = parseLink(style[LINK_KEY])
      if (link?.kind === 'page') {
        if (link.pageId === page.id) style[LINK_KEY] = pageLink(target.pageId)
        else delete style[LINK_KEY]
      }
      return { ...cell, style }
    })
    target.insertCells(cells)
    setInserting(null); setOpen(false)
  })
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) { setForm(false); setInserting(null); setRemoving(null); setError(null) } }}>
      <PopoverTrigger asChild>
        {compact ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.myTemplates}
            title={m.myTemplatesHint}
          >
            <LayoutTemplate />
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm">{m.myTemplates}</Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={m.myTemplates} className="max-h-[75vh] w-96 max-w-[95vw] overflow-y-auto">
        <h3 className="mb-3 font-semibold">{m.myTemplates}</h3>
        {error && <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
        {form ? <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void save() }}>
          <label className="block text-sm">{m.title}<input aria-label={m.templateTitle} className="mt-1 w-full rounded border bg-background p-2" value={name} onChange={(event) => setName(event.target.value)} required maxLength={200} /></label>
          <label className="block text-sm">{m.description}<textarea aria-label={m.templateDescription} className="mt-1 w-full rounded border bg-background p-2" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} /></label>
          {document && (!editing || replace) && <label className="flex gap-2 text-sm"><input type="checkbox" disabled={!editor} checked={selectionOnly} onChange={(event) => setSelectionOnly(event.target.checked)} />{m.selectionOnly}</label>}
          {(!editing || replace) && <p className="text-xs text-muted-foreground">{m.whatIsSaved}</p>}
          <div className="flex gap-2"><Button type="submit" disabled={busy || !name.trim()}>{busy ? m.saving : m.saveTemplate}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setForm(false)}>{m.cancel}</Button></div>
        </form> : inserting ? <div className="space-y-3">
          <p className="text-sm">{m.insertFrom(inserting.title)}</p>
          <label className="block text-sm">{m.templatePage}<select aria-label={m.templatePage} className="ml-2 rounded border bg-background p-1" value={pageIndex} onChange={(event) => setPageIndex(Number(event.target.value))}>{inserting.pages.map((page, index) => <option key={page.id} value={index}>{page.name}</option>)}</select></label>
          <Button type="button" disabled={busy || !editor || editor.readOnly} onClick={() => void insert()}>{m.insert}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setInserting(null)}>{m.cancel}</Button>
        </div> : <>
          {document && <Button type="button" className="mb-3" disabled={busy} onClick={() => edit(null)}>{m.saveBoardAsTemplate}</Button>}
          {templates.isPending && <p role="status">{m.loadingTemplates}</p>}
          {templates.isError && <p role="alert">{m.loadFailed}</p>}
          {templates.data?.length === 0 && <p className="text-sm text-muted-foreground">{m.noTemplates}</p>}
          <ul className="space-y-3">{templates.data?.map((template) => <li key={template.id} className="rounded border p-3">
            <p className="font-medium">{template.title}</p><p className="whitespace-pre-wrap text-sm text-muted-foreground">{template.description}</p>
            {removing === template.id ? <div role="alertdialog" aria-label={m.deletingTemplate(template.title)}>
              <p className="my-2 text-sm">{m.deleteQuestion}</p>
              <Button type="button" disabled={busy} onClick={() => void run(async () => { await deletePersonalTemplate(template.id); await client.invalidateQueries({ queryKey: PERSONAL_TEMPLATES_KEY }); setRemoving(null) })}>{m.deleteTemplate}</Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setRemoving(null)}>{m.cancel}</Button>
            </div> : <div className="mt-2 flex flex-wrap gap-1">
              <Button type="button" size="sm" disabled={busy} onClick={() => void create(template)}>{m.createBoard}</Button>
              {editor && !editor.readOnly && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void prepareInsert(template)}>{m.insertOnPage}</Button>}
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => edit(template)}>{m.rename}</Button>
              {document && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => edit(template, true)}>{m.updateFromBoard}</Button>}
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setRemoving(template.id)}>{m.delete}</Button>
            </div>}
          </li>)}</ul>
        </>}
      </PopoverContent>
    </Popover>
  )
}
