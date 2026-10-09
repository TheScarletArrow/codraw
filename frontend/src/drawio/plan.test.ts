import { expect, it } from 'vitest'
import { boardWith, shapeData } from '../diagram/testing.ts'
import { PLAN_KEY } from '../diagram/plan.ts'
import { exportDrawio } from './serialize.ts'
import { parseDrawio } from './parse.ts'

it('keeps the mark of plan of an element through a file of draw.io', async () => {
  const doc = boardWith(shapeData('s', 'a0', { value: 'API', style: { [PLAN_KEY]: 'added', rounded: true } }))
  const xml = exportDrawio(doc)
  expect(xml).toContain('codrawPlan=added')
  const parsed = await parseDrawio(xml)
  expect(JSON.stringify(parsed)).toContain('"codrawPlan":"added"')
})
