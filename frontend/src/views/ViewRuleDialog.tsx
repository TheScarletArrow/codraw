import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import type * as Y from 'yjs'
import { Button } from '@/components/ui/button'
import { buildModel, environments, sliceValues, type BoardModel } from '../diagram/boardModel.ts'
import {
  environmentLabel,
  hasScope,
  SLICE_FACETS,
  SLICE_LABELS,
  VIEW_KIND_LABELS,
  VIEW_KINDS,
  viewPageName,
  type SliceFacet,
  type ViewKind,
  type ViewRule,
} from '../diagram/viewRule.ts'
import { elementName, elementsOf, modelStore } from './modelStore.ts'

/**
 * The elements a view of the kind may be about: systems for their context and containers, containers for components; the
 * external ones last.
 */
function scopesOf(model: BoardModel, kind: ViewKind) {
  const levels = kind === 'context' || kind === 'containers' ? (['system'] as const) : kind === 'components' ? (['container'] as const) : []
  const elements = elementsOf(model, levels)
  return [...elements.filter((element) => !element.external), ...elements.filter((element) => element.external)]
}

/** A first rule for a new view: the containers of the first system, or the landscape. */
function firstRule(model: BoardModel): ViewRule {
  const system = scopesOf(model, 'containers')[0]
  return { kind: system ? 'containers' : 'landscape', scope: system?.id ?? null, environment: null, owners: [], tags: [], technologies: [] }
}

/** What the scope or the environment of a kind is called in the window. */
const SCOPE_LABELS: Partial<Record<ViewKind, string>> = { context: 'Система', containers: 'Система', components: 'Контейнер' }

/**
 * The window of the rule of a view of the model: what it shows, of which system, container or environment, and its slice
 * by teams, tags and technologies — the values that the elements of the model have. A new view is created by
 * `onCreate` with the name of its page; the rule of a view is changed by `onApply`, and `onDetach` makes the view a page
 * of its own.
 */
export function ViewRuleDialog({
  document,
  rule: current = null,
  onCreate,
  onApply,
  onDetach,
  onClose,
}: {
  document: Y.Doc
  /** The rule of the view to change; `null` for a new view. */
  rule?: ViewRule | null
  onCreate?: (rule: ViewRule, name: string) => void
  onApply?: (rule: ViewRule) => void
  onDetach?: () => void
  onClose: () => void
}) {
  // The window follows the changes of the board, and reads the model as it is now: the store may hold it as it was a
  // moment ago, without the system just drawn.
  const store = modelStore(document)
  useSyncExternalStore(store.subscribe, store.get)
  const model = buildModel(document)
  const [rule, setRule] = useState<ViewRule>(() => current ?? firstRule(model))
  const id = useId()
  const dialog = useRef<HTMLFormElement>(null)
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('select, input')?.focus()
  }, [])

  const scopes = scopesOf(model, rule.kind)
  const envs = environments(model)
  const values = sliceValues(model)
  const scope = rule.scope !== null ? model.elements.get(rule.scope) : undefined
  const choose = (kind: ViewKind) => {
    const candidates = scopesOf(model, kind)
    setRule({
      ...rule,
      kind,
      scope: hasScope(kind) ? (candidates.find((element) => element.id === rule.scope)?.id ?? candidates[0]?.id ?? null) : null,
      environment: kind === 'deployment' ? (rule.environment !== null && envs.includes(rule.environment) ? rule.environment : (envs[0] ?? null)) : null,
    })
  }
  const toggle = (facet: SliceFacet, value: string, on: boolean) =>
    setRule({ ...rule, [facet]: on ? [...rule[facet], value] : rule[facet].filter((other) => other !== value) })
  const ready = hasScope(rule.kind) ? scope !== undefined : rule.kind === 'deployment' ? rule.environment !== null : true
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!ready) return
    if (current) onApply?.(rule)
    else onCreate?.(rule, viewPageName(rule, scope ? elementName(scope) : ''))
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={current ? 'Правило представления' : 'Новое представление'}
        className="flex max-h-[85vh] w-[440px] max-w-full flex-col gap-3 overflow-y-auto rounded-md border bg-background p-4 text-foreground shadow-lg"
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }}
      >
        <h2 className="text-sm font-semibold">{current ? 'Правило представления' : 'Новое представление'}</h2>
        <p className="text-xs text-muted-foreground">
          Представление показывает модель доски — то, что нарисовано на всех страницах, — и следует за её изменениями.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Что показать</span>
          <select className="h-8 rounded-md border bg-background px-2" value={rule.kind} onChange={(event) => choose(event.target.value as ViewKind)}>
            {VIEW_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {VIEW_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        {hasScope(rule.kind) &&
          (scopes.length === 0 ? (
            <p role="status" className="text-sm text-muted-foreground">
              {rule.kind === 'components'
                ? 'В модели нет контейнеров: добавьте Container или «Сервис».'
                : 'В модели нет систем: добавьте Software System или границу системы.'}
            </p>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">{SCOPE_LABELS[rule.kind]}</span>
              <select className="h-8 rounded-md border bg-background px-2" value={rule.scope ?? ''} onChange={(event) => setRule({ ...rule, scope: event.target.value })}>
                {scopes.map((element) => (
                  <option key={element.id} value={element.id}>
                    {element.external ? `${elementName(element)} (внешняя)` : elementName(element)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        {rule.kind === 'deployment' &&
          (envs.length === 0 ? (
            <p role="status" className="text-sm text-muted-foreground">
              В модели нет узлов развёртывания: добавьте «Узел развёртывания» из раздела C4 и задайте ему окружение.
            </p>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Окружение</span>
              <select
                className="h-8 rounded-md border bg-background px-2"
                value={rule.environment ?? ''}
                onChange={(event) => setRule({ ...rule, environment: event.target.value })}
              >
                {envs.map((environment) => (
                  <option key={environment} value={environment}>
                    {environmentLabel(environment)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">Срез</legend>
          <p className="text-xs text-muted-foreground">
            Оставляет элементы с выбранными значениями; {rule.kind === 'deployment' ? 'узлы' : 'то, о чём представление,'} остаются всегда.
          </p>
          {SLICE_FACETS.map((facet) => {
            const options = [...new Set([...values[facet], ...rule[facet]])]
            return (
              <div key={facet} role="group" aria-labelledby={`${id}-${facet}`} className="flex flex-col gap-1">
                <span id={`${id}-${facet}`} className="text-xs text-muted-foreground">
                  {SLICE_LABELS[facet]}
                </span>
                {options.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Нет в модели</span>
                ) : (
                  <div className="flex max-h-28 flex-col overflow-y-auto">
                    {options.map((value) => (
                      <label key={value} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={rule[facet].includes(value)} onChange={(event) => toggle(facet, value, event.target.checked)} />
                        <span className="min-w-0 truncate">{value}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </fieldset>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
          {current && onDetach && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mr-auto"
              title="Ячейки останутся ячейками тех же элементов, но больше не будут следовать модели"
              onClick={() => {
                onDetach()
                onClose()
              }}
            >
              Сделать обычной страницей
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" size="sm" disabled={!ready}>
            {current ? 'Применить' : 'Создать'}
          </Button>
        </div>
      </form>
    </div>
  )
}
