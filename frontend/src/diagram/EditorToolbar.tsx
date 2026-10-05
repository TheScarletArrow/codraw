import {
  AArrowDown,
  AArrowUp,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Plus,
  Redo2,
  Underline,
  Undo2,
  UnfoldHorizontal,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ColorPicker } from './ColorPicker.tsx'
import type { DiagramEditor, EdgeEnd, FontStyleFlag, SelectionText, TextAlign } from './editor.ts'
import { EDGE_MARKERS } from './extensions.ts'
import { GeometryPicker } from './GeometryPicker.tsx'
import { LineStylePicker } from './LineStylePicker.tsx'
import { NumberField } from './NumberField.tsx'
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from './textSize.ts'
import { useEditorState } from './useEditorState.ts'

interface EditorToolbarProps {
  editor: DiagramEditor | null
  /** The participant may only view the board: only the scale is shown. */
  readOnly?: boolean
}

export function EditorToolbar({ editor, readOnly = false }: EditorToolbarProps) {
  const { canUndo, canRedo, scale } = useEditorState(editor)

  return (
    <div role="toolbar" aria-label="Инструменты" className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {!readOnly && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Отменить"
            title="Отменить (Ctrl+Z)"
            disabled={!editor || !canUndo}
            onClick={() => editor?.undo()}
          >
            <Undo2 />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Повторить"
            title="Повторить (Ctrl+Shift+Z)"
            disabled={!editor || !canRedo}
            onClick={() => editor?.redo()}
          >
            <Redo2 />
          </Button>
          <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        </>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Уменьшить"
        title="Уменьшить (Ctrl+колесо)"
        disabled={!editor}
        onClick={() => editor?.zoomOut()}
      >
        <ZoomOut />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-16 tabular-nums"
        aria-label="Масштаб"
        title="Сбросить масштаб до 100%"
        disabled={!editor}
        onClick={() => editor?.zoomActual()}
      >
        {Math.round(scale * 100)}%
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Увеличить"
        title="Увеличить (Ctrl+колесо)"
        disabled={!editor}
        onClick={() => editor?.zoomIn()}
      >
        <ZoomIn />
      </Button>
      {!readOnly && <EditingTools editor={editor} />}
    </div>
  )
}

/** Tools that change the selected objects. */
function EditingTools({ editor }: { editor: DiagramEditor | null }) {
  const { tableSelected, edgeMarkers, colors, line, text, geometry } = useEditorState(editor)

  return (
    <>
      {tableSelected && (
        <>
          <span aria-hidden className="mx-1 h-5 w-px bg-border" />
          <Button type="button" variant="ghost" size="sm" onClick={() => editor?.addTableField()}>
            <Plus />
            Добавить поле
          </Button>
        </>
      )}
      {colors && (
        <>
          <span aria-hidden className="mx-1 h-5 w-px bg-border" />
          {colors.hasShapes && (
            <ColorPicker
              label="Заливка"
              name="Цвет заливки"
              noneLabel="Без заливки"
              value={colors.fill}
              onChange={(color) => editor?.setColor('fill', color)}
            />
          )}
          <ColorPicker
            label="Линия"
            name="Цвет линии"
            noneLabel="Без линии"
            value={colors.stroke}
            onChange={(color) => editor?.setColor('stroke', color)}
          />
          <ColorPicker
            label="Текст"
            name="Цвет текста"
            value={colors.font}
            onChange={(color) => editor?.setColor('font', color)}
          />
        </>
      )}
      {line && <LineStylePicker line={line} onChange={(changes) => editor?.setLineStyle(changes)} />}
      {text && <TextTools text={text} editor={editor} />}
      {geometry && <GeometryPicker geometry={geometry} onChange={(changes) => editor?.setGeometry(changes)} />}
      {edgeMarkers && (
        <>
          <span aria-hidden className="mx-1 h-5 w-px bg-border" />
          <MarkerSelect label="Начало" end="start" value={edgeMarkers.start} editor={editor} />
          <MarkerSelect label="Конец" end="end" value={edgeMarkers.end} editor={editor} />
        </>
      )}
    </>
  )
}

const FONT_STYLES: { flag: FontStyleFlag; label: string; shortcut: string; icon: LucideIcon }[] = [
  { flag: 'bold', label: 'Жирный', shortcut: 'Ctrl+B', icon: Bold },
  { flag: 'italic', label: 'Курсив', shortcut: 'Ctrl+I', icon: Italic },
  { flag: 'underline', label: 'Подчёркнутый', shortcut: 'Ctrl+U', icon: Underline },
]

const TEXT_ALIGNS: { align: TextAlign; label: string; icon: LucideIcon }[] = [
  { align: 'left', label: 'Текст по левому краю', icon: AlignLeft },
  { align: 'center', label: 'Текст по центру', icon: AlignCenter },
  { align: 'right', label: 'Текст по правому краю', icon: AlignRight },
]

/**
 * Size, font styles and alignment of the text of the selected objects, and the width of the selected shapes that
 * follows their labels.
 */
function TextTools({ text, editor }: { text: SelectionText; editor: DiagramEditor | null }) {
  return (
    <>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Уменьшить текст"
        title="Уменьшить текст"
        onClick={() => editor?.stepFontSize(-1)}
      >
        <AArrowDown />
      </Button>
      <NumberField
        label="Размер текста"
        value={text.fontSize}
        min={MIN_FONT_SIZE}
        max={MAX_FONT_SIZE}
        className="w-12 shrink-0 text-center"
        onCommit={(size) => editor?.setFontSize(size)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Увеличить текст"
        title="Увеличить текст"
        onClick={() => editor?.stepFontSize(1)}
      >
        <AArrowUp />
      </Button>
      {FONT_STYLES.map(({ flag, label, shortcut, icon: Icon }) => (
        <Button
          key={flag}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={text[flag]}
          title={`${label} (${shortcut})`}
          className={cn(text[flag] && 'bg-accent text-accent-foreground')}
          onClick={() => editor?.toggleFontStyle(flag)}
        >
          <Icon />
        </Button>
      ))}
      {TEXT_ALIGNS.map(({ align, label, icon: Icon }) => (
        <Button
          key={align}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={text.align === align}
          title={label}
          className={cn(text.align === align && 'bg-accent text-accent-foreground')}
          onClick={() => editor?.setTextAlign(align)}
        >
          <Icon />
        </Button>
      ))}
      {text.autoWidth !== null && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={text.autoWidth}
          title="Автоширина: ширина фигуры следует за её подписью"
          className={cn(text.autoWidth && 'bg-accent text-accent-foreground')}
          onClick={() => editor?.setAutoWidth(!text.autoWidth)}
        >
          <UnfoldHorizontal />
          Автоширина
        </Button>
      )}
    </>
  )
}

/** Marker of one end of the selected edges; empty when they have different markers. */
function MarkerSelect({
  label,
  end,
  value,
  editor,
}: {
  label: string
  end: EdgeEnd
  value: string | null
  editor: DiagramEditor | null
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {label}
      <select
        aria-label={`${label} связи`}
        className="h-8 rounded-md border bg-background px-2 text-foreground"
        value={value ?? ''}
        onChange={(event) => editor?.setEdgeMarker(end, event.target.value)}
      >
        {value === null && <option value="">—</option>}
        {EDGE_MARKERS.map((marker) => (
          <option key={marker.value} value={marker.value}>
            {marker.label}
          </option>
        ))}
      </select>
    </label>
  )
}
