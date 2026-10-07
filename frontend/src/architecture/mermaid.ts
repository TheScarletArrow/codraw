import { c4Macros, macroString } from './c4Macros.ts'
import { modelElements, type ArchModel } from './model.ts'

/** The kind of a diagram of Mermaid C4 by the most detailed level of the elements. */
function diagramKind(model: ArchModel): string {
  const kinds = new Set(modelElements(model).map((element) => element.kind))
  return kinds.has('component') ? 'C4Component' : kinds.has('container') ? 'C4Container' : 'C4Context'
}

/** The model as a diagram of Mermaid C4. */
export function mermaidC4(model: ArchModel): string {
  return [diagramKind(model), `title ${macroString(model.title).slice(1, -1)}`, '', ...c4Macros(model), ''].join('\n')
}
