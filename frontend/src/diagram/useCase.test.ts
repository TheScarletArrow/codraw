import { describe, expect, it } from 'vitest'
import { parseStyle } from '../drawio/style.ts'
import { htmlToText } from '../drawio/labels.ts'
import { isUseCaseRelation, relationChanges, relationOf, stereotypeOf, UML_RELATIONS, type UmlRelation } from './useCase.ts'

/** The style an edge gets when it becomes `relation`: the changes applied to `style`. */
function made(relation: UmlRelation, style: Record<string, unknown> = {}, label = '') {
  const changes = relationChanges(relation, label)
  const next: Record<string, unknown> = { ...style }
  for (const [key, value] of Object.entries(changes.style)) {
    if (value === undefined) delete next[key]
    else next[key] = value
  }
  return { style: next, label: changes.label }
}

describe('relations of use cases', () => {
  it('are offered in the order of the toolbar', () => {
    expect(UML_RELATIONS.map((relation) => relation.label)).toEqual([
      'Ассоциация',
      'Включение «include»',
      'Расширение «extend»',
      'Обобщение',
    ])
  })

  it('read stereotypes in the quotes of UML 2, in angle brackets and without them, in any case', () => {
    expect(stereotypeOf('«include»')).toBe('include')
    expect(stereotypeOf('<<extend>>')).toBe('extend')
    expect(stereotypeOf(' Include ')).toBe('include')
    expect(stereotypeOf('« extend »')).toBe('extend')
    expect(stereotypeOf('includes')).toBeNull()
    expect(stereotypeOf('«include»\nпромокод')).toBeNull()
    expect(stereotypeOf('')).toBeNull()
  })

  it('make each relation that is then read back', () => {
    for (const { value } of UML_RELATIONS) {
      const edge = made(value, { endArrow: 'classic', startArrow: 'ERmany', dashed: true, dashPattern: '2 3' }, 'Подпись')
      expect(relationOf(edge.style, edge.label)).toBe(value)
    }
  })

  it('draw an inclusion dashed with an open arrow and its stereotype, without the dots and the start marker', () => {
    const edge = made('include', { startArrow: 'classic', dashed: true, dashPattern: '2 3' }, '1..*')

    expect(edge.style).toEqual({ dashed: true, endArrow: 'open', endSize: 12 })
    expect(edge.label).toBe('«include»')
    expect(made('extend', {}, '«include»').label).toBe('«extend»')
  })

  it('draw a generalization solid with a hollow triangle, and an association without markers', () => {
    expect(made('generalization', { dashed: true, endSize: 12 }, '«include»')).toEqual({
      style: { endArrow: 'block', endFill: false, endSize: 16 },
      label: '',
    })
    expect(made('association', { endArrow: 'block', endFill: false, endSize: 16 }, '1..*')).toEqual({
      style: { endArrow: 'none' },
      label: '1..*',
    })
  })

  it('read lines that are no relation as none', () => {
    // The default arrow of an edge.
    expect(relationOf({}, '')).toBeNull()
    expect(relationOf({ endArrow: 'none', startArrow: 'classic' }, '')).toBeNull()
    // Dashed without a stereotype, or a stereotype on a solid line.
    expect(relationOf({ dashed: true, endArrow: 'open' }, 'вызывает')).toBeNull()
    expect(relationOf({ endArrow: 'open' }, '«include»')).toBeNull()
    expect(relationOf({ endArrow: 'none' }, '«extend»')).toBeNull()
    // A filled triangle is no generalization.
    expect(relationOf({ endArrow: 'block' }, '')).toBeNull()
  })

  it('read the relations of the shapes of UML of draw.io', () => {
    const edge = (style: string, label = '') => relationOf(parseStyle(style, 'edge'), htmlToText(label))

    expect(edge('endArrow=open;endSize=12;dashed=1;html=1;', '&lt;&lt;include&gt;&gt;')).toBe('include')
    expect(edge('endArrow=open;endSize=12;dashed=1;html=1;', 'Extend')).toBe('extend')
    expect(edge('endArrow=block;endSize=16;endFill=0;html=1;')).toBe('generalization')
    expect(edge('endArrow=none;html=1;')).toBe('association')
  })

  it('tell the relations of use cases from any line without markers', () => {
    expect(isUseCaseRelation({ endArrow: 'none' }, '')).toBe(false)
    expect(isUseCaseRelation({ endArrow: 'block', endFill: 0 }, '')).toBe(true)
    expect(isUseCaseRelation({ dashed: 1, endArrow: 'open' }, '<<extend>>')).toBe(true)
    expect(isUseCaseRelation({}, '')).toBe(false)
  })
})
