# Tasks

## 1. Комментарий на холсте

- [ ] 1.1 frontend: `diagram/tableComments.ts` — ключ `codrawTableComment`, `tableCommentOf`, `normalizeTableComment`, шрифт и место строки, предел ширины, обрезка с «…»; проверка: модульные тесты
- [ ] 1.2 frontend: высота заголовка и `spacingBottom` в `configureTableFields`, строка и значки на линии названия в `TableShape`, место строки в `DiagramBuilder.table` и `stackTable` слияния; проверка: тесты редактора (поля под строкой, без комментария как прежде, размер текста), слияния и шаблонов
- [ ] 1.3 frontend: ширина строки в `fittedWidthOf` и `tableWidth` с пределом 320px, подсказка с комментарием над обрезанной строкой; проверка: тесты автоширины и подсказки

## 2. Правка

- [ ] 2.1 frontend: `setTableComment`, `EditorState.tableComment`, `test/fakeEditor.ts`; проверка: тесты редактора — один шаг отмены, второй клиент видит комментарий, закреплённая таблица и «Просмотр» не меняются, база не передаёт комментарий
- [ ] 2.2 frontend: поле «Комментарий» в `TableTools` (Enter, уход из поля, Escape, пустое убирает); проверка: компонентные тесты панели

## 3. Файлы, поиск, изменения, предложения

- [ ] 3.1 frontend: `codrawTableComment` в `ATTRIBUTE_KEYS`, атрибут в `serialize.ts` и `parse.ts`, проверка ключа в `boardFile/read.ts`; проверка: тесты `.drawio` туда и обратно с `;` и `=` и `.codraw`
- [ ] 3.2 frontend: комментарий в `propertiesText` поиска, слово «комментарий» в `board/changes.ts`, ключ данных в `schemaImportUpdate`; проверка: тесты поиска, изменений и обновления схемы

## 4. SQL и живая база

- [ ] 4.1 frontend: `parseSql` — `SqlTable.comment`, `SqlView.comment`, `COMMENT ON TABLE|VIEW|MATERIALIZED VIEW … IS …`, `COMMENT` в параметрах `CREATE TABLE` и в `ALTER TABLE`; проверка: тесты `parseSql` и дампов
- [ ] 4.2 frontend: `schemaCells` (ключ и ширина), `diagramTables` и `diagramViews` с комментарием, `COMMENT ON` в `schemaSql`; проверка: тесты `erDiagram` и круговой путь SQL → ячейки → SQL
- [ ] 4.3 backend: `PostgresSchemaReader` — `obj_description` таблиц и представлений, `COMMENT ON …` за `CREATE`; проверка: тест чтения схемы на Testcontainers

## 5. Документация и проверка

- [ ] 5.1 docs: README («Таблицы базы данных», «SQL и Mermaid», «План работ»), `docs/running.md`, тема справки, «Что нового» 0.50.0 и `version`; проверка: тесты справки и «Что нового»
- [ ] 5.2 e2e: `table-comments.spec.ts` — комментарий с панели виден второму участнику, `Ctrl+Z` убирает его, «Скопировать SQL» даёт `COMMENT ON TABLE`; проверка: спек зелёный
- [ ] 5.3 проверка: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `./gradlew build`, проверка в браузере
