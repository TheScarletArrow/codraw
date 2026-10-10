import { ArrowLeft } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ApiSpecError, MAX_DOCUMENT_SIZE, type ApiSource } from '../apiSpec/loadDocument.ts'
import { documentMessages as d } from '../apiSpec/messages.ts'
import type { CellData } from '../diagram/model.ts'
import { downloadBlob } from '../lib/download.ts'
import script from './codraw.gradle?raw'
import { gradleGraph, gradleGraphError, gradleSummary } from './gradleGraph.ts'
import { infraCells } from './infraCells.ts'
import { GRADLE_COMMAND, isGradleFile, parseGradleFolder, parseGradleGraphs, type FolderFile, type GradleBuild } from './parseGradle.ts'
import { infraMessages } from './messages.tsx'

interface GradleImportProps {
  /** Adds the cells built for a top-left corner to the page. */
  onAdd: (cells: (origin: { x: number; y: number }) => Promise<CellData[]>) => void
  /** Opens a proposal whose draft gets the cells of this import as an update. */
  onUpdate?: (source: string, summary: string, cells: (origin: { x: number; y: number }) => Promise<CellData[]>) => void
  /** Prefix of `codrawSource` markers for cells of this import. */
  sourcePrefix?: string
  onBack: () => void
  busy: boolean
  /** Why the last addition failed. */
  error: string | null
}

/** A chosen folder of a project: its name and the files of its build. */
interface Folder {
  name: string
  files: FolderFile[]
}

/** The build of the folder, else of the graphs; the errors of what does not give one. */
function readBuild(folder: Folder | null, graphs: ApiSource[]): { build: GradleBuild | null; errors: string[] } {
  if (folder) {
    try {
      return { build: parseGradleFolder(folder.files), errors: [] }
    } catch (error) {
      if (error instanceof ApiSpecError) return { build: null, errors: [error.message] }
      throw error
    }
  }
  if (graphs.length === 0) return { build: null, errors: [] }
  return parseGradleGraphs(graphs)
}

/**
 * The import of a build of Gradle in the menu «SQL и Mermaid»: the graph that the init script `codraw.gradle` prints,
 * opened or pasted, or the files of the build in a chosen folder; a summary of what the page gets and the errors.
 */
export function GradleImport({ onAdd, onUpdate, sourcePrefix = 'gradle', onBack, busy, error }: GradleImportProps) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<ApiSource[]>([])
  const [folder, setFolder] = useState<Folder | null>(null)
  const [tests, setTests] = useState(false)
  const [c4, setC4] = useState(false)
  const m = infraMessages.gradle
  const graphInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  const graphs = useMemo(() => (text.trim() === '' ? files : [...files, { name: d.text, text }]), [files, text])
  const result = useMemo(() => readBuild(folder, graphs), [folder, graphs])
  const graph = useMemo(() => (result.build ? gradleGraph(result.build, { tests, c4 }) : null), [result, tests, c4])
  const empty = graph !== null && graph.nodes.length === 0
  const tooLarge = graph ? gradleGraphError(graph) : null
  const errors = [...result.errors, ...(tooLarge ? [tooLarge] : []), ...(error ? [error] : [])]

  const openGraphs = async (list: FileList | null) => {
    if (!list) return
    // A file larger than the limit is not read: its size alone refuses it.
    const read = async (file: File) => ({ name: file.name, size: file.size, text: file.size > MAX_DOCUMENT_SIZE ? '' : await file.text() })
    setFiles(await Promise.all(Array.from(list, read)))
    setFolder(null)
  }

  const openFolder = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    // Only the files of the build are read; the rest of the folder is not opened.
    const chosen = Array.from(list).filter((file) => isGradleFile(file.webkitRelativePath) && file.size <= MAX_DOCUMENT_SIZE)
    const read = await Promise.all(chosen.map(async (file) => ({ path: file.webkitRelativePath, text: await file.text() })))
    setFolder({ name: list[0]!.webkitRelativePath.split('/')[0]!, files: read })
    setFiles([])
    setText('')
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon-sm" aria-label={d.back} onClick={onBack}>
          <ArrowLeft />
        </Button>
        <h2 className="text-sm font-semibold">{m.title}</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        {m.intro(<code>codraw.gradle</code>, <code>{GRADLE_COMMAND} &gt; modules.json</code>, <code>modules.json</code>)}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => downloadBlob(new Blob([script], { type: 'text/plain' }), 'codraw.gradle')}
      >
        {m.download}
      </Button>
      <textarea
        aria-label={m.graphLabel}
        placeholder={'{"format":"codraw-gradle","version":1,"projects":[…]}'}
        rows={4}
        spellCheck={false}
        className="w-full resize-y rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setFolder(null)
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => graphInput.current?.click()}>
          {m.openGraph}
        </Button>
        <input
          ref={graphInput}
          type="file"
          accept=".json"
          multiple
          hidden
          aria-label={m.graphFiles}
          onChange={(event) => void openGraphs(event.target.files)}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => folderInput.current?.click()}>
          {m.openFolder}
        </Button>
        <input
          ref={(input) => {
            folderInput.current = input
            // A folder rather than files: the attribute browsers know has no property in the types of React.
            input?.setAttribute('webkitdirectory', '')
          }}
          type="file"
          multiple
          hidden
          aria-label={m.folderLabel}
          onChange={(event) => void openFolder(event.target.files)}
        />
        {folder ? (
          <span className="truncate text-xs text-muted-foreground" title={folder.files.map((file) => file.path).join('\n')}>
            {m.folder(folder.name, folder.files.length)}
          </span>
        ) : (
          files.length > 0 && (
            <span className="truncate text-xs text-muted-foreground" title={files.map((file) => file.name).join(', ')}>
              {d.fileCount} {files.length}
            </span>
          )
        )}
      </div>
      <label className="flex items-center gap-2 text-sm" title={m.testsTitle}>
        <input type="checkbox" checked={tests} onChange={(event) => setTests(event.target.checked)} />
        {m.tests}
      </label>
      <label className="flex items-center gap-2 text-sm" title={m.c4Title}>
        <input type="checkbox" checked={c4} onChange={(event) => setC4(event.target.checked)} />
        {infraMessages.c4}
      </label>
      <p role="status" className="text-xs text-muted-foreground">
        {graph && result.build ? gradleSummary(result.build, graph) : m.hint}
      </p>
      {errors.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 text-xs text-destructive">
          {errors.map((message, index) => (
            <p key={index} className="break-words">
              {message}
            </p>
          ))}
        </div>
      )}
      <Button
        type="button"
        size="sm"
        disabled={busy || !graph || empty || tooLarge !== null}
        onClick={() => graph && onAdd((origin) => infraCells(graph, origin, undefined, sourcePrefix))}
      >
        {d.addToPage}
      </Button>
      {onUpdate && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || !graph || empty || tooLarge !== null}
          onClick={() => graph && result.build && onUpdate(sourceTitle(folder, graphs), gradleSummary(result.build, graph), (origin) => infraCells(graph, origin, undefined, sourcePrefix))}
        >
          {d.updateViaProposal}
        </Button>
      )}
    </>
  )
}

const sourceTitle = (folder: Folder | null, graphs: ApiSource[]) =>
  folder ? folder.name : graphs.length === 1 ? graphs[0]!.name : graphs.length > 1 ? infraMessages.gradle.sourceFiles(graphs.length) : 'Gradle'
