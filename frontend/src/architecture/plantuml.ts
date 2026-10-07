import { c4Macros, macroString } from './c4Macros.ts'
import type { ArchModel } from './model.ts'

/**
 * The model as a diagram of C4-PlantUML. The macros come from the standard library of PlantUML, which a server of
 * PlantUML and the plugins of editors have without a connection to GitHub; `<C4/C4_Component>` brings those of
 * containers and of the context too.
 */
export function plantUml(model: ArchModel): string {
  return ['@startuml', '!include <C4/C4_Component>', '', `title ${macroString(model.title).slice(1, -1)}`, '', ...c4Macros(model), '', 'SHOW_LEGEND()', '@enduml', ''].join('\n')
}
