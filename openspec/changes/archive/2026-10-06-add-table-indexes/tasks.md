# Tasks

## 1. Текст индекса и SQL

- [x] 1.1 frontend: `sql/tableIndex.ts` — `splitIndex`, `indexText`, `renameIndex`, `indexColumnNames`, имя индекса по умолчанию; проверка: модульные тесты (кавычки, `USING`, `WHERE`, `INCLUDE`, выражения, `ASC`/`DESC`)
- [x] 1.2 frontend: `parseSql` — `SqlTable.indexes`, `CREATE [UNIQUE] INDEX`, `DROP INDEX`, `ALTER INDEX … RENAME TO`, составной `UNIQUE`, `INDEX`/`KEY` MySQL, переименование и удаление столбцов, `DROP CONSTRAINT`; проверка: тесты `parseSql` и миграций Flyway
- [x] 1.3 frontend: `DiagramBuilder.table` со строками индексов и `INDEX_GAP`, `schemaCells` (строки и ширина), `diagramSchema` без строк индексов в столбцах, `CREATE INDEX` в `schemaSql`, число индексов в сводке `SqlMenu`; проверка: тесты `erDiagram`, круговой путь SQL → ячейки → SQL, `SqlMenu.test.tsx`

## 2. Таблица на холсте

- [x] 2.1 frontend: `tableRows.ts` — строки индексов и значок `index` у полей; `tableShapes.ts` — `isIndexRow`, `isColumnField` без строк индексов, строки индексов в `tableRowsOf`, рисование значка, линии и подписи «Индексы»; проверка: тесты `tableRows` и стилей
- [x] 2.2 frontend: `TableLayout` (поля, затем индексы, `INDEX_GAP`), стиль, подпись и ввод имени строки индекса, `isValidSource`, `addTableField` перед индексами, `addTableIndex`, `setIndexProps`, `EditorState.index`, переименование поля в индексах, `ownFields` без строк индексов; проверка: тесты редактора — один шаг отмены, второй клиент видит строки, «Просмотр», базовые таблицы
- [x] 2.3 frontend: «Добавить индекс» и `IndexProps` в `TableTools` и `FieldPopover`, цель меню `'index'` и «Добавить индекс» в `canvasMenu`; проверка: компонентные тесты и тесты меню
- [x] 2.4 frontend: `codrawIndex` в `BOOLEAN_KEYS`; проверка: тесты `.drawio` туда и обратно и копирования таблицы с индексами

## 3. Проверка и документация

- [x] 3.1 e2e: `table-indexes.spec.ts` — добавление индекса видно второму участнику, импорт SQL с индексами; проверка: спек зелёный
- [x] 3.2 README (индексы и план со списком `add-table-indexes`); проверка в браузере: блок, значки, правка, выгрузка SQL
