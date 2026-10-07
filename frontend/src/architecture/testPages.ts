import type { CellData } from '../diagram/model.ts'
import { BOARD_TEMPLATES } from '../templates/templates.ts'
import { DiagramBuilder } from '../templates/builder.ts'

/** The page of the template «C4: контейнеры». */
export const c4Page = (): CellData[] => BOARD_TEMPLATES.find((template) => template.id === 'c4-containers')!.build()

/**
 * A page as the import of docker-compose draws one: a database and a container in the frame of a network, a link
 * named by its protocol, a sticker and a table.
 */
export function composePage(): CellData[] {
  const builder = new DiagramBuilder()
  builder.shape('boundary', 0, 0, { value: 'data', width: 600, height: 300 })
  const postgres = builder.shape('database', 40, 60, { value: 'postgres\npostgres:18-alpine\n:5432' })
  const backend = builder.shape('container', 300, 60, { value: 'backend\n./backend' })
  builder.edge(backend, postgres, { value: 'JDBC' })
  builder.shape('sticky', 700, 0, { value: 'Проверить пароли' })
  const table = builder.table('users', 700, 300, ['id uuid PK'])
  builder.edge(table.fields[0]!, postgres)
  return builder.build()
}
