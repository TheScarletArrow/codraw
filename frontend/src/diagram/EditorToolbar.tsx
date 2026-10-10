import {
  AArrowDown,
  AArrowUp,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Lock,
  LockOpen,
  Maximize,
  MessageCirclePlus,
  Paintbrush,
  PaintRoller,
  Pencil,
  Redo2,
  TextWrap,
  Underline,
  Undo2,
  UnfoldHorizontal,
  Wand,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrangePicker } from './ArrangePicker.tsx'
import { toolbarMessages as m } from './EditorToolbar.messages.ts'
import { AutoLayoutPicker } from './AutoLayoutPicker.tsx'
import type { PlanView } from './plan.ts'
import { PlanViewPicker } from './PlanViewPicker.tsx'
import { ColorPicker } from './ColorPicker.tsx'
import type { DiagramEditor, EdgeEnd, FontStyleFlag, SelectionLock, SelectionText, TextAlign } from './editor.ts'
import { EDGE_MARKERS } from './edgeMarkers.ts'
import { UML_RELATIONS, type UmlRelation } from './useCase.ts'
import { FONT_FAMILIES } from './fonts.ts'
import { GeometryPicker } from './GeometryPicker.tsx'
import { LineStylePicker } from './LineStylePicker.tsx'
import { lockLabel } from './locks.ts'
import { NumberField } from './NumberField.tsx'
import { FilterPicker } from './FilterPicker.tsx'
import type { PageFilter } from './pageFilter.ts'
import { SequenceTools } from './SequenceTools.tsx'
import { TableTools } from './TableTools.tsx'
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from './textSize.ts'
import { useEditorState } from './useEditorState.ts'

interface EditorToolbarProps {
  editor: DiagramEditor | null
  /** The participant may only view the board: only the scale, the laser pointer and the comment tool are shown. */
  readOnly?: boolean
  /** The page works on a board with others: the laser pointer and the comment tool are shown. */
  collaboration?: boolean
  /** How the participant shows the page (see `plan.ts`), and how it changes it; without it, the choice is not offered. */
  planView?: PlanView
  onPlanViewChange?: (view: PlanView) => void
  /** The filter of the page and how it changes; without them the toolbar has no «Фильтр». */
  filter?: PageFilter
  onFilterChange?: (filter: PageFilter) => void
}

export function EditorToolbar({
  editor,
  readOnly = false,
  collaboration = true,
  planView,
  onPlanViewChange,
  filter,
  onFilterChange,
}: EditorToolbarProps) {
  const { canUndo, canRedo, scale, laser, commentTool, pencil } = useEditorState(editor)

  return (
    // Takes the room the line leaves and scrolls beyond it; the tools with a text show it while that room is enough. The
    // line keeps at least the room of the tools up to «Показать всё».
    <div
      role="toolbar"
      aria-label={m.tools}
      className="@container flex min-w-65 flex-1 items-center gap-1 overflow-x-auto"
    >
      {!readOnly && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.undo}
            title={m.undoTitle}
            disabled={!editor || !canUndo}
            onClick={() => editor?.undo()}
          >
            <Undo2 />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.redo}
            title={m.redoTitle}
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
        aria-label={m.zoomOut}
        title={m.zoomOutTitle}
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
        aria-label={m.scale}
        title={m.scaleTitle}
        disabled={!editor}
        onClick={() => editor?.zoomActual()}
      >
        {Math.round(scale * 100)}%
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={m.zoomIn}
        title={m.zoomInTitle}
        disabled={!editor}
        onClick={() => editor?.zoomIn()}
      >
        <ZoomIn />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={m.fit}
        title={m.fitTitle}
        disabled={!editor}
        onClick={() => editor?.zoomToFit()}
      >
        <Maximize />
      </Button>
      {filter && onFilterChange && <FilterPicker editor={editor} filter={filter} onChange={onFilterChange} />}
      {collaboration && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.laser}
            aria-pressed={laser}
            title={laser ? m.laserOff : m.laserOn}
            disabled={!editor}
            className="aria-pressed:bg-accent"
            onClick={() => editor?.setLaser(!laser)}
          >
            <Wand />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.comment}
            aria-pressed={commentTool}
            title={commentTool ? m.commentOff : m.commentOn}
            disabled={!editor}
            className="aria-pressed:bg-accent"
            onClick={() => editor?.setCommentTool(!commentTool)}
          >
            <MessageCirclePlus />
          </Button>
        </>
      )}
      {!readOnly && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={m.pencil}
          aria-pressed={pencil}
          title={pencil ? m.pencilOff : m.pencilOn}
          disabled={!editor}
          className="aria-pressed:bg-accent"
          onClick={() => editor?.setPencil(!pencil)}
        >
          <Pencil />
        </Button>
      )}
      {!readOnly && <AutoLayoutPicker editor={editor} />}
      {planView && onPlanViewChange && <PlanViewPicker editor={editor} readOnly={readOnly} view={planView} onChange={onPlanViewChange} />}
      {!readOnly && (pencil ? <PencilTools editor={editor} /> : <EditingTools editor={editor} />)}
    </div>
  )
}

/**
 * While the pencil is on, the line it draws with, in place of the tools of the selection: «Линия» is its color, «Стиль»
 * its width and dash. What is chosen for the lines of the selection is the line of the pencil too.
 */
function PencilTools({ editor }: { editor: DiagramEditor | null }) {
  const { pencilLine } = useEditorState(editor)

  return (
    <>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      <ColorPicker
        label={m.line}
        name={m.lineColor}
        value={pencilLine.color}
        onChange={(color) => editor?.setPencilLine({ color })}
      />
      <LineStylePicker
        line={{ width: pencilLine.width, dash: pencilLine.dash, edgeShape: null, hasEdges: false }}
        onChange={({ width, dash }) => editor?.setPencilLine({ width, dash })}
      />
    </>
  )
}

/**
 * The lock of the selection, then the tools that change the selected objects; while every selected object is locked,
 * the tools are disabled, and the lock says who locked them.
 */
function EditingTools({ editor }: { editor: DiagramEditor | null }) {
  const {
    tableSelected,
    tableVendor,
    field,
    index,
    tableBase,
    tableView,
    edgeMarkers,
    edgeRelation,
    colors,
    line,
    text,
    geometry,
    arrange,
    lock,
    canCopyStyle,
    canPasteStyle,
    sequence,
  } = useEditorState(editor)

  return (
    <>
      {lock && <LockTools editor={editor} lock={lock} />}
      {lock && <StyleTools editor={editor} canCopy={canCopyStyle} canPaste={canPasteStyle} />}
      {/* Copying a locked diagram as Mermaid changes nothing: the tools disable the rest themselves. */}
      {sequence && <SequenceTools editor={editor} sequence={sequence} />}
      <fieldset disabled={lock?.all ?? false} className="flex shrink-0 items-center gap-1">
        {tableSelected && (
          <TableTools editor={editor} vendor={tableVendor} field={field} index={index} base={tableBase} view={tableView} />
        )}
        {colors && (
          <>
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            {colors.hasShapes && (
              <ColorPicker
                label={m.fill}
                name={m.fillColor}
                noneLabel={m.noFill}
                value={colors.fill}
                onChange={(color) => editor?.setColor('fill', color)}
                opacity={colors.fillOpacity}
                opacityName={m.fillOpacity}
                onOpacityChange={(opacity) => editor?.setFillOpacity(opacity)}
              />
            )}
            <ColorPicker
              label={m.line}
              name={m.lineColor}
              noneLabel={m.noLine}
              value={colors.stroke}
              onChange={(color) => editor?.setColor('stroke', color)}
            />
            <ColorPicker
              label={m.text}
              name={m.textColor}
              value={colors.font}
              onChange={(color) => editor?.setColor('font', color)}
            />
          </>
        )}
        {line && <LineStylePicker line={line} onChange={(changes) => editor?.setLineStyle(changes)} />}
        {text && <TextTools text={text} editor={editor} />}
        {geometry && (
          <GeometryPicker
            geometry={geometry}
            onChange={(changes) => editor?.setGeometry(changes)}
            onRotate={(angle) => editor?.setRotation(angle)}
          />
        )}
        {arrange >= 2 && (
          <ArrangePicker
            count={arrange}
            onAlign={(align) => editor?.alignShapes(align)}
            onDistribute={(direction) => editor?.distributeShapes(direction)}
          />
        )}
        {edgeMarkers && (
          <>
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            <MarkerSelect label={m.start} end="start" value={edgeMarkers.start} editor={editor} />
            <MarkerSelect label={m.end} end="end" value={edgeMarkers.end} editor={editor} />
            {edgeRelation && <RelationSelect value={edgeRelation.value} editor={editor} />}
          </>
        )}
      </fieldset>
    </>
  )
}

/**
 * «Закрепить», which locks what is not locked yet, or, when all of the selection is locked, «Открепить» and who locked
 * it. A mixed selection is unlocked from the menu. The button comes first: the toolbar may have no room for the rest.
 */
function LockTools({ editor, lock }: { editor: DiagramEditor | null; lock: SelectionLock }) {
  return (
    <>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      {lock.canLock ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={m.lock}
          title={m.lockTitle}
          onClick={() => editor?.setLocked(true)}
        >
          <Lock />
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={m.unlock}
          title={m.unlockTitle}
          onClick={() => editor?.setLocked(false)}
        >
          <LockOpen />
        </Button>
      )}
      {lock.all && (
        <span className="shrink-0 pr-1 text-sm whitespace-nowrap text-muted-foreground">
          {lockLabel(lock.locks.map((holder) => holder.lockedBy))}
        </span>
      )}
    </>
  )
}

/**
 * «Копировать стиль» and «Вставить стиль», before the colors: outside the tools that a lock disables, as the look of
 * a locked element can be copied.
 */
function StyleTools({ editor, canCopy, canPaste }: { editor: DiagramEditor | null; canCopy: boolean; canPaste: boolean }) {
  return (
    <>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={m.copyStyle}
        title={m.copyStyleTitle}
        disabled={!canCopy}
        onClick={() => editor?.copyStyle()}
      >
        <Paintbrush />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={m.pasteStyle}
        title={m.pasteStyleTitle}
        disabled={!canPaste}
        onClick={() => editor?.pasteStyle()}
      >
        <PaintRoller />
      </Button>
    </>
  )
}

const FONT_STYLES: { flag: FontStyleFlag; label: string; shortcut: string; icon: LucideIcon }[] = [
  { flag: 'bold', label: m.bold, shortcut: 'Ctrl+B', icon: Bold },
  { flag: 'italic', label: m.italic, shortcut: 'Ctrl+I', icon: Italic },
  { flag: 'underline', label: m.underline, shortcut: 'Ctrl+U', icon: Underline },
]

const TEXT_ALIGNS: { align: TextAlign; label: string; icon: LucideIcon }[] = [
  { align: 'left', label: m.alignLeft, icon: AlignLeft },
  { align: 'center', label: m.alignCenter, icon: AlignCenter },
  { align: 'right', label: m.alignRight, icon: AlignRight },
]

/**
 * Size, font styles and alignment of the text of the selected objects, and the width of the selected shapes that
 * follows their labels.
 */
function TextTools({ text, editor }: { text: SelectionText; editor: DiagramEditor | null }) {
  return (
    <>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      <FontSelect value={text.fontFamily} editor={editor} />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={m.smallerText}
        title={m.smallerText}
        onClick={() => editor?.stepFontSize(-1)}
      >
        <AArrowDown />
      </Button>
      <NumberField
        label={m.textSize}
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
        aria-label={m.largerText}
        title={m.largerText}
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
      {(['bullet', 'numbered'] as const).map((kind) => {
        const label = kind === 'bullet' ? m.bulletList : m.numberedList
        const Icon = kind === 'bullet' ? List : ListOrdered
        return (
          <Button
            key={kind}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={text.list === kind}
            title={label}
            className={cn(text.list === kind && 'bg-accent text-accent-foreground')}
            onClick={() => editor?.setList(text.list === kind ? null : kind)}
          >
            <Icon />
          </Button>
        )
      })}
      {text.autoWidth !== null && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={text.autoWidth}
          title={m.autoWidthTitle}
          className={cn(text.autoWidth && 'bg-accent text-accent-foreground')}
          onClick={() => editor?.setAutoWidth(!text.autoWidth)}
        >
          <UnfoldHorizontal />
          {m.autoWidth}
        </Button>
      )}
      {text.textWrap !== null && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={text.textWrap}
          title={m.wrapTitle}
          className={cn(text.textWrap && 'bg-accent text-accent-foreground')}
          onClick={() => editor?.setTextWrap(!text.textWrap)}
        >
          <TextWrap />
          {m.wrap}
        </Button>
      )}
    </>
  )
}

/**
 * The font of the selected text, each font shown in itself; empty when the objects have different fonts. A font of
 * a draw.io file that the list does not have is shown as well.
 */
function FontSelect({ value, editor }: { value: string | null; editor: DiagramEditor | null }) {
  return (
    <select
      aria-label={m.font}
      title={m.font}
      className="h-8 w-36 shrink-0 rounded-md border bg-background px-2 text-sm text-foreground"
      style={{ fontFamily: value ?? undefined }}
      value={value ?? ''}
      onChange={(event) => editor?.setFontFamily(event.target.value)}
    >
      {value === null && <option value="">—</option>}
      {value !== null && !FONT_FAMILIES.includes(value) && <option value={value}>{value}</option>}
      {FONT_FAMILIES.map((family) => (
        <option key={family} value={family} style={{ fontFamily: family }}>
          {family}
        </option>
      ))}
    </select>
  )
}

/** The relation of use cases of the selected edges; empty when they differ or some look like none. */
function RelationSelect({ value, editor }: { value: UmlRelation | null; editor: DiagramEditor | null }) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {m.relation}
      <select
        aria-label={m.edgeRelation}
        className="h-8 rounded-md border bg-background px-2 text-foreground"
        value={value ?? ''}
        onChange={(event) => editor?.setEdgeRelation(event.target.value as UmlRelation)}
      >
        {value === null && <option value="">—</option>}
        {UML_RELATIONS.map((relation) => (
          <option key={relation.value} value={relation.value}>
            {relation.label}
          </option>
        ))}
      </select>
    </label>
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
        aria-label={m.ofEdge(label)}
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
