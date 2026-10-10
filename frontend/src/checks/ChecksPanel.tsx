import { CircleAlert, Eye, EyeOff, ListChecks, TriangleAlert, X } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import type * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { kindLabel } from '../diagram/elementProps.ts'
import type { CellRef } from '../diagram/sharedElements.ts'
import { pagesLabel } from '../elements/elementList.ts'
import {
  CHECK_RULE_ORDER,
  CHECK_RULES,
  issuesLabel,
  setIssueHidden,
  setRuleEnabled,
  type CheckIssue,
  type CheckLevel,
  type CheckPlace,
  type CheckRule,
  type MergeChoice,
} from './checks.ts'
import { checkMessages as m } from './messages.ts'
import { useChecks } from './useChecks.ts'

/**
 * The button of the header of the board that shows and hides the panel of the checks, with how many remarks the board
 * has.
 */
export function ChecksButton({ document, open, onToggle }: { document: Y.Doc | null; open: boolean; onToggle: () => void }) {
  const count = useChecks(document).shown.length
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={count > 0 ? m.checksCount(issuesLabel(count)) : m.checks}
      aria-pressed={open}
      title={count > 0 ? m.checksCount(issuesLabel(count)) : m.diagramChecks}
      className="shrink-0"
      onClick={onToggle}
    >
      <ListChecks />
      {count > 0 && (
        <span aria-hidden className="text-xs tabular-nums">
          {count}
        </span>
      )}
    </Button>
  )
}

function LevelIcon({ level, className }: { level: CheckLevel; className?: string }) {
  return level === 'warning' ? (
    <TriangleAlert aria-hidden className={cn('size-4 shrink-0 text-amber-600 dark:text-amber-400', className)} />
  ) : (
    <CircleAlert aria-hidden className={cn('size-4 shrink-0 text-sky-600 dark:text-sky-400', className)} />
  )
}

type Tab = 'issues' | 'rules'

/**
 * The checks of the board (see `checks.ts`), at the right of the canvas while it is open: the remarks of the rules that
 * are on, by rule, each with why the rule asks for it and the pages of its cells, where a click goes; and the rules.
 * Who edits the board hides a remark, shows a hidden one again, turns a rule on or off for everybody, and merges
 * probable duplicates into one element.
 */
export function ChecksPanel({
  document,
  canChange,
  onShow,
  onMerge,
  onClose,
}: {
  document: Y.Doc | null
  /** The participant edits the board: hides remarks, turns rules on and off, merges duplicates. */
  canChange: boolean
  /** Goes to a cell: opens its page and selects it. */
  onShow: (pageId: string, cellId: string) => void
  /** Makes the elements of the cells one element with the properties of the element of `keep`. */
  onMerge: (refs: CellRef[], keep: CellRef) => void
  onClose: () => void
}) {
  const { shown, hidden, settings } = useChecks(document)
  const [tab, setTab] = useState<Tab>('issues')
  const [showHidden, setShowHidden] = useState(false)
  const listed = showHidden ? [...shown, ...hidden] : shown
  const hiddenKeys = settings.hidden
  const hide = (issue: CheckIssue, on: boolean) => document && setIssueHidden(document, issue.key, on)

  return (
    <aside
      aria-label={m.checks}
      className="pointer-events-auto flex min-h-0 w-[320px] max-w-full flex-col overflow-hidden rounded-md border bg-background text-foreground shadow-lg"
    >
      <header className="flex items-center gap-1 border-b px-3 py-2">
        <h2 className="mr-auto text-sm font-semibold">{m.checks}</h2>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={m.close} title={m.close} onClick={onClose}>
          <X />
        </Button>
      </header>
      <div role="tablist" aria-label={m.checks} className="flex gap-1 border-b p-1">
        {(
          [
            ['issues', m.remarks, shown.length],
            ['rules', m.rulesTab, null],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded px-1.5 py-1 text-xs whitespace-nowrap hover:bg-accent',
              tab === value && 'bg-accent font-medium',
            )}
            onClick={() => setTab(value)}
          >
            {/* The space keeps the number apart from the name of the tab; flex boxes do not show it. */}
            {label}
            {count !== null && ' '}
            {count !== null && <span className="text-muted-foreground tabular-nums">{count}</span>}
          </button>
        ))}
      </div>
      {tab === 'issues' ? (
        <div role="tabpanel" aria-label={m.remarks} className="flex min-h-0 flex-col overflow-y-auto">
          {listed.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              {settings.disabled.size === CHECK_RULE_ORDER.length ? m.allRulesOff : m.noRemarks}
            </p>
          ) : (
            CHECK_RULE_ORDER.map((rule) => {
              const issues = listed.filter((issue) => issue.rule === rule)
              if (issues.length === 0) return null
              return (
                <RuleIssues
                  key={rule}
                  rule={rule}
                  issues={issues}
                  hidden={hiddenKeys}
                  canChange={canChange}
                  onShow={onShow}
                  onHide={hide}
                  onMerge={onMerge}
                />
              )
            })
          )}
          {hidden.length > 0 && (
            <label className="flex items-center gap-2 border-t px-3 py-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} />
              {m.showHidden(hidden.length)}
            </label>
          )}
        </div>
      ) : (
        <div role="tabpanel" aria-label={m.rulesTab} className="flex min-h-0 flex-col gap-2 overflow-y-auto p-3">
          <p className="text-xs text-muted-foreground">
            {canChange ? m.sharedRules : m.editorsChangeRules}
          </p>
          {CHECK_RULE_ORDER.map((rule) => (
            <label key={rule} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={!settings.disabled.has(rule)}
                disabled={!canChange || !document}
                onChange={(event) => document && setRuleEnabled(document, rule, event.target.checked)}
              />
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5">
                  <LevelIcon level={CHECK_RULES[rule].level} />
                  {CHECK_RULES[rule].title}
                </span>
                <span className="text-xs text-muted-foreground">{CHECK_RULES[rule].reason}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </aside>
  )
}

function RuleIssues({
  rule,
  issues,
  hidden,
  canChange,
  onShow,
  onHide,
  onMerge,
}: {
  rule: CheckRule
  issues: CheckIssue[]
  hidden: ReadonlySet<string>
  canChange: boolean
  onShow: (pageId: string, cellId: string) => void
  onHide: (issue: CheckIssue, hidden: boolean) => void
  onMerge: (refs: CellRef[], keep: CellRef) => void
}) {
  const info = CHECK_RULES[rule]
  return (
    <section aria-label={info.title} className="flex flex-col gap-1 border-b p-3 last:border-b-0">
      <h3 className="flex items-center gap-1.5 text-sm font-medium">
        <LevelIcon level={info.level} />
        {m.ruleCount(info.title, issues.length)}
      </h3>
      <p className="text-xs text-muted-foreground">{info.reason}</p>
      <ul className="mt-1 flex flex-col gap-2">
        {issues.map((issue) => (
          <IssueRow
            key={issue.key}
            issue={issue}
            hidden={hidden.has(issue.key)}
            canChange={canChange}
            onShow={onShow}
            onHide={onHide}
            onMerge={onMerge}
          />
        ))}
      </ul>
    </section>
  )
}

/** The places of a remark as links: «стр. «Контекст»», and «стр. «Контекст» (2)» for another cell on the same page. */
function placeLabels(places: CheckPlace[]): { place: CheckPlace; label: string }[] {
  const seen = new Map<string, number>()
  return places.map((place) => {
    const index = (seen.get(place.pageId) ?? 0) + 1
    seen.set(place.pageId, index)
    return { place, label: index === 1 ? m.page(place.pageName) : m.pageAgain(place.pageName, index) }
  })
}

function IssueRow({
  issue,
  hidden,
  canChange,
  onShow,
  onHide,
  onMerge,
}: {
  issue: CheckIssue
  hidden: boolean
  canChange: boolean
  onShow: (pageId: string, cellId: string) => void
  onHide: (issue: CheckIssue, hidden: boolean) => void
  onMerge: (refs: CellRef[], keep: CellRef) => void
}) {
  const [merging, setMerging] = useState(false)
  return (
    <li className={cn('flex items-start gap-1', hidden && 'opacity-60')}>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm break-words">{issue.subject}</span>
        {issue.detail && <span className="text-xs text-muted-foreground">{issue.detail}</span>}
        <span className="flex flex-wrap gap-x-2">
          {placeLabels(issue.places).map(({ place, label }) => (
            <Button
              key={`${place.pageId}/${place.cellId}`}
              type="button"
              variant="link"
              size="xs"
              className="h-auto px-0"
              title={m.showOnPage(place.pageName)}
              onClick={() => onShow(place.pageId, place.cellId)}
            >
              {label}
            </Button>
          ))}
          {issue.choices && canChange && !hidden && !merging && (
            <Button type="button" variant="link" size="xs" className="h-auto px-0" onClick={() => setMerging(true)}>
              {m.mergeMenu}
            </Button>
          )}
        </span>
        {issue.choices && merging && (
          <MergeForm
            choices={issue.choices}
            onMerge={(keep) => {
              setMerging(false)
              onMerge(
                issue.choices!.map((choice) => choice.ref),
                keep,
              )
            }}
            onCancel={() => setMerging(false)}
          />
        )}
      </div>
      {canChange && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          // The rule tells apart two remarks of one element or edge.
          aria-label={(hidden ? m.showRemark : m.hideRemark)(CHECK_RULES[issue.rule].title, issue.subject)}
          title={hidden ? m.showRemarkHint : m.hideRemarkHint}
          onClick={() => onHide(issue, !hidden)}
        >
          {hidden ? <Eye /> : <EyeOff />}
        </Button>
      )}
    </li>
  )
}

const choiceDetails = (choice: MergeChoice) =>
  [choice.properties.kind ? kindLabel(choice.properties.kind) : '', choice.properties.technology, pagesLabel(choice.pages)]
    .filter(Boolean)
    .join(' · ')

/** Which element's properties the merged element keeps; the first is chosen. */
function MergeForm({ choices, onMerge, onCancel }: { choices: MergeChoice[]; onMerge: (keep: CellRef) => void; onCancel: () => void }) {
  const [kept, setKept] = useState(0)
  const name = useId()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onMerge(choices[kept]!.ref)
  }
  return (
    <form aria-label={m.mergeInto} className="mt-1 flex flex-col gap-1 rounded border p-2" onSubmit={submit}>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-xs text-muted-foreground">{m.whichProperties}</legend>
        {choices.map((choice, index) => (
          <label key={`${choice.ref.pageId}/${choice.ref.cellId}`} className="flex items-start gap-2 text-sm">
            <input type="radio" name={name} className="mt-1" checked={kept === index} onChange={() => setKept(index)} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{choice.properties.name || m.unnamed}</span>
              <span className="truncate text-xs text-muted-foreground">{choiceDetails(choice)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {m.cancel}
        </Button>
        <Button type="submit" size="sm">
          {m.merge}
        </Button>
      </div>
    </form>
  )
}
