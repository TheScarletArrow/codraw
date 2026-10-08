import { describe, expect, it } from 'vitest'
import { commonPlan, hiddenIn, PLAN_KEY, planOf, planViewFromParams, writePlanViewParam } from './plan.ts'

describe('plan of the architecture', () => {
  it('reads the mark of a style, and what each view leaves out', () => {
    expect(planOf({ [PLAN_KEY]: 'added' })).toBe('added')
    expect(planOf({ [PLAN_KEY]: 'removed' })).toBe('removed')
    expect(planOf({ [PLAN_KEY]: 'later' })).toBeNull()
    expect(planOf(null)).toBeNull()
    expect([hiddenIn('current', 'added'), hiddenIn('current', 'removed'), hiddenIn('current', null)]).toEqual([true, false, false])
    expect([hiddenIn('target', 'added'), hiddenIn('target', 'removed')]).toEqual([false, true])
    expect([hiddenIn('diff', 'added'), hiddenIn('diff', 'removed')]).toEqual([false, false])
  })

  it('keeps the view in the address, the difference without a parameter', () => {
    const params = new URLSearchParams('page=p2')
    expect(planViewFromParams(params)).toBe('diff')
    writePlanViewParam(params, 'target')
    expect(params.toString()).toBe('page=p2&view=target')
    expect(planViewFromParams(params)).toBe('target')
    writePlanViewParam(params, 'diff')
    expect(params.toString()).toBe('page=p2')
    expect(planViewFromParams(new URLSearchParams('view=later'))).toBe('diff')
  })

  it('tells the common mark of the selection', () => {
    expect(commonPlan([])).toBeNull()
    expect(commonPlan(['added', 'added'])).toEqual({ value: 'added', mixed: false })
    expect(commonPlan([null, null])).toEqual({ value: null, mixed: false })
    expect(commonPlan(['added', null])).toEqual({ value: null, mixed: true })
  })
})
