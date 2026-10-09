/**
 * The current and the target architecture on one board: an element — a shape, a table, a group, an edge — that will
 * appear or will go is marked so by a key of its style; the others are as they are. Each participant shows the page as
 * it is now, as it will be, or with the difference: the new in green, what goes in red and dashed. The view is the
 * participant's own and changes no document; the marks are the board's, as any style. «Применить целевое состояние»
 * removes what goes and takes the marks off what appeared.
 */

/** Style key of an element that is planned: it will appear, or it will go. */
export const PLAN_KEY = 'codrawPlan'

export type Plan = 'added' | 'removed'

export const PLANS: readonly Plan[] = ['added', 'removed']

/** What a mark is called in the interface; an element without one is as it is. */
export const PLAN_LABELS: Readonly<Record<Plan, string>> = { added: 'Появится', removed: 'Уйдёт' }

export const isPlan = (value: unknown): value is Plan => value === 'added' || value === 'removed'

/** The mark of a style; `null` for an element as it is, or a value CoDraw does not know. */
export function planOf(style: Record<string, unknown> | null | undefined): Plan | null {
  const value = style?.[PLAN_KEY]
  return isPlan(value) ? value : null
}

/** How a participant shows the page: the difference with both states, the state now, or the target. */
export type PlanView = 'diff' | 'current' | 'target'

export const PLAN_VIEWS: readonly PlanView[] = ['diff', 'current', 'target']

export const PLAN_VIEW_LABELS: Readonly<Record<PlanView, string>> = { diff: 'Разница', current: 'Как есть', target: 'Как будет' }

export const isPlanView = (value: unknown): value is PlanView => value === 'diff' || value === 'current' || value === 'target'

/** The parameter of the address of a board with the view of its page, absent for the difference. */
export const PLAN_VIEW_PARAM = 'view'

/** The view an address asks for: the difference without one or for a value CoDraw does not know. */
export function planViewFromParams(params: URLSearchParams): PlanView {
  const value = params.get(PLAN_VIEW_PARAM)
  return isPlanView(value) ? value : 'diff'
}

/** Writes the view into the parameters of an address in place of the one they had. */
export function writePlanViewParam(params: URLSearchParams, view: PlanView) {
  if (view === 'diff') params.delete(PLAN_VIEW_PARAM)
  else params.set(PLAN_VIEW_PARAM, view)
}

/** Whether a view leaves out an element with the mark: the state now has nothing that will appear, the target nothing that goes. */
export function hiddenIn(view: PlanView, plan: Plan | null): boolean {
  return (view === 'current' && plan === 'added') || (view === 'target' && plan === 'removed')
}

/** The colors of the difference, as the comparison of versions has them: green for the new, red for what goes. */
export const PLAN_COLORS: Readonly<Record<Plan, string>> = { added: '#16a34a', removed: '#dc2626' }

/** The marks of the selected elements that may have one (see `DiagramEditor.setPlan`). */
export interface SelectionPlan {
  /** The mark all of them have, `null` when none of them has one or when they differ. */
  value: Plan | null
  /** They have different marks, or some of them have none. */
  mixed: boolean
}

/** The common mark of elements; `null` for no elements. */
export function commonPlan(plans: readonly (Plan | null)[]): SelectionPlan | null {
  if (plans.length === 0) return null
  const first = plans[0]!
  const mixed = plans.some((plan) => plan !== first)
  return { value: mixed ? null : first, mixed }
}
