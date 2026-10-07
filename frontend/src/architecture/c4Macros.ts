import type { ArchElement, ArchModel, ArchNode } from './model.ts'

/** A string of a macro of C4-PlantUML or Mermaid C4: they know no escapes, so double quotes become single ones. */
export const macroString = (text: string) => `"${text.replace(/\s+/g, ' ').replace(/"/g, "'")}"`

const NAMES = { person: 'Person', system: 'System', container: 'Container', component: 'Component' }
const VARIANTS = { plain: '', database: 'Db', queue: 'Queue' }

/** The macro of an element: `ContainerDb(db, "База данных", "PostgreSQL", "Описание")`, `System_Ext(…)`. */
function elementMacro(element: ArchElement): string {
  const name = `${NAMES[element.kind]}${element.kind === 'person' ? '' : VARIANTS[element.variant]}${element.external ? '_Ext' : ''}`
  const values = element.kind === 'container' || element.kind === 'component' ? [element.name, element.technology, element.description] : [element.name, element.description]
  return `${name}(${[element.id, ...values.map(macroString)].join(', ')})`
}

const BOUNDARIES = { system: 'System_Boundary', container: 'Container_Boundary', group: 'Boundary' }

/** The elements in their frames and the relations of the model as macros of C4, shared by C4-PlantUML and Mermaid C4. */
export function c4Macros(model: ArchModel): string[] {
  const nodes = (items: ArchNode[], indent: string): string[] =>
    items.flatMap((node) =>
      node.type === 'element'
        ? [`${indent}${elementMacro(node)}`]
        : [`${indent}${BOUNDARIES[node.kind]}(${node.id}, ${macroString(node.name)}) {`, ...nodes(node.children, `${indent}    `), `${indent}}`],
    )
  const relations = model.relations.map(
    (relation) =>
      `Rel(${[relation.source.id, relation.target.id, macroString(relation.description), ...(relation.technology ? [macroString(relation.technology)] : [])].join(', ')})`,
  )
  return [...nodes(model.roots, ''), ...(relations.length > 0 ? ['', ...relations] : [])]
}
