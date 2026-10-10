import { HOLLOW_TRIANGLE, markerChanges, markerOf } from './edgeMarkers.ts'
import type { StyleValue } from './model.ts'
import { shapeOf, type ShapeStyle } from './shapes.ts'

/**
 * Relations of use cases of UML as data, without maxGraph: what an edge is by its line, its markers and its label, and
 * the keys that make it one. A relation is not stored on its own: it is what the edge looks like, in the keys of draw.io,
 * so a file of draw.io has it too and a change of the line by hand changes it.
 */

export type UmlRelation = 'association' | 'include' | 'extend' | 'generalization'

/** The relations in the order of the toolbar, with their names. */
export const UML_RELATIONS: readonly { value: UmlRelation; label: string }[] = [
  { value: 'association', label: 'Ассоциация' },
  { value: 'include', label: 'Включение «include»' },
  { value: 'extend', label: 'Расширение «extend»' },
  { value: 'generalization', label: 'Обобщение' },
]

type Stereotype = 'include' | 'extend'

/** The labels of dependencies, with the quotes of UML 2. */
export const STEREOTYPE_LABELS: Readonly<Record<Stereotype, string>> = { include: '«include»', extend: '«extend»' }

/** The sizes of the markers of relations, as the shapes of UML of draw.io have them: at the default of 6 they are hard to see. */
const GENERALIZATION_SIZE = 16
const DEPENDENCY_SIZE = 12

const isOn = (value: unknown) => value === true || value === 1 || value === '1'

/** The stereotype a label is: `«include»`, `<<include>>` or `include` in any case, spaces aside; or none. */
export function stereotypeOf(label: string): Stereotype | null {
  const word = label.replace(/[«»<>\s]/g, '').toLowerCase()
  return word === 'include' || word === 'extend' ? word : null
}

/**
 * The relation of an edge with `style` and `label`, or `null` when it looks like none: an association is a solid line
 * without markers, a generalization a solid line with a hollow triangle at its end, an inclusion and an extension a
 * dashed line with an open arrow at its end and their stereotype. The sizes of the markers and the color do not count.
 */
export function relationOf(style: Readonly<Record<string, unknown>>, label: string): UmlRelation | null {
  if (markerOf(style, 'start') !== 'none') return null
  const end = markerOf(style, 'end')
  const stereotype = stereotypeOf(label)
  if (isOn(style.dashed)) return end === 'open' ? stereotype : null
  if (stereotype) return null
  if (end === 'none') return 'association'
  return end === HOLLOW_TRIANGLE ? 'generalization' : null
}

/** An edge that is one of the relations only use cases have: any line without markers is an association. */
export function isUseCaseRelation(style: Readonly<Record<string, unknown>>, label: string): boolean {
  const relation = relationOf(style, label)
  return relation !== null && relation !== 'association'
}

/**
 * What makes an edge with `label` the `relation`: the keys of its style (`undefined` removes a key) and its label. The
 * marker of the start goes, the plain dash replaces the dots; a stereotype gives way to the label of the relation, and
 * another label stays unless the relation has a stereotype of its own.
 */
export function relationChanges(
  relation: UmlRelation,
  label: string,
): { style: Record<string, StyleValue | undefined>; label: string } {
  // Without a marker of its own the start has none.
  const line = { startArrow: undefined, startFill: undefined, startSize: undefined, dashPattern: undefined }
  if (relation === 'include' || relation === 'extend') {
    return {
      style: { ...line, dashed: true, ...markerChanges('open', 'end'), endSize: DEPENDENCY_SIZE },
      label: STEREOTYPE_LABELS[relation],
    }
  }
  const end =
    relation === 'generalization'
      ? { ...markerChanges(HOLLOW_TRIANGLE, 'end'), endSize: GENERALIZATION_SIZE }
      : { ...markerChanges('none', 'end'), endSize: undefined }
  return { style: { ...line, dashed: undefined, ...end }, label: stereotypeOf(label) ? '' : label }
}

/** A new edge between an actor and a use case, either way round, is an association: a line without markers. */
export function isAssociationPair(
  source: Readonly<Record<string, unknown>> | null,
  target: Readonly<Record<string, unknown>> | null,
): boolean {
  const ids = [source, target].map((style) => (style ? shapeOf(style as ShapeStyle)?.id : undefined))
  return ids.includes('uml-actor') && ids.includes('uml-use-case')
}
