import { ImageDown } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DiagramEditor } from '../diagram/editor.ts'
import { useEditorState } from '../diagram/useEditorState.ts'
import { downloadBlob } from '../lib/download.ts'
import { imageFileName, type ImageFormat } from './files.ts'
import { svgToPng } from './png.ts'

interface ImageExportMenuProps {
  editor: DiagramEditor | null
  boardTitle: string
  pageName: string
  pageCount: number
}

/** Saves the current page, or what is selected on it, as a PNG or SVG image. */
export function ImageExportMenu({ editor, boardTitle, pageName, pageCount }: ImageExportMenuProps) {
  const { hasCells, hasSelection } = useEditorState(editor)
  const [selectionOnly, setSelectionOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // Without a selection the whole page is saved, whatever the box says.
  const onlySelected = selectionOnly && hasSelection

  const save = async (format: ImageFormat) => {
    const image = editor?.exportSvg(onlySelected)
    if (!image) return
    setBusy(true)
    setFailed(false)
    try {
      const blob = format === 'png' ? await svgToPng(image) : new Blob([image.svg], { type: 'image/svg+xml' })
      downloadBlob(blob, imageFileName(boardTitle, pageName, pageCount, format))
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Экспорт в изображение"
          title="Экспорт в изображение: страница в PNG или SVG"
          disabled={!editor}
        >
          <ImageDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-64 flex-col gap-3" aria-label="Экспорт в изображение">
        {!hasCells && <p className="text-sm text-muted-foreground">На странице нет объектов</p>}
        <label className="flex items-center gap-2 text-sm has-disabled:text-muted-foreground">
          <input
            type="checkbox"
            checked={onlySelected}
            disabled={!hasSelection}
            onChange={(event) => setSelectionOnly(event.target.checked)}
          />
          Только выделенное
        </label>
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={!hasCells || busy} onClick={() => void save('png')}>
            Сохранить PNG
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!hasCells || busy} onClick={() => void save('svg')}>
            Сохранить SVG
          </Button>
        </div>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            Не удалось сохранить изображение
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
