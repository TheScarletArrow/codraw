# Tasks

## 1. Импорт представлений

- [ ] 1.1 frontend: `sql/viewQuery.ts` — список первого `SELECT` (CTE, скобки, `DISTINCT`), имена столбцов, источники `FROM`/`JOIN` с псевдонимами, `*` и `t.*`, типы из столбцов, приведений, литералов и `count`, зависимости на любой глубине; проверка: unit-тесты на каждый случай
- [ ] 1.2 frontend: `sql/parseSql.ts` — `SqlView` и `SqlSchema.views`, `CREATE [OR REPLACE] [TEMP] [RECURSIVE] [MATERIALIZED] VIEW` с опциями MySQL, явный список столбцов, запрос без `WITH [NO] DATA`, `ALTER … VIEW … RENAME`, `DROP … VIEW`, индексы материализованных, переименование таблицы в зависимостях; `statementKinds.ts` — `DROP VIEW` не служебный, `REFRESH` служебный; проверка: unit-тесты `parseSql` и `statementKinds`
- [ ] 1.3 frontend: `tokenize` читает `/*!NNNNN … */` в файлах как код; проверка: тесты на дампах `mysqldump` и `mariadb-dump` (представление, триггер пропущен), `pg_dump` (представление со столбцами), исходные схемы дают ту же диаграмму

## 2. Представления на доске

- [ ] 2.1 frontend: `diagram/views.ts` — ключи и чтение признаков; `drawio/style.ts`, `serialize.ts`, `parse.ts` — `codrawView`, `codrawViewMaterialized` булевы, `codrawViewQuery` атрибутом `<object>`; проверка: тесты `.drawio` туда и обратно с `;` и `=` в запросе
- [ ] 2.2 frontend: значок «VIEW» / «MAT VIEW» в `TableShape`, место под значок в автоширине редактора и `tableWidth`; проверка: тесты стилей и ширины
- [ ] 2.3 frontend: команды `setViewTable`, `setViewMaterialized`, `setViewQuery`, `EditorState.tableView`, `SelectedField.inView`, снятие базы у представления; проверка: тесты редактора — один шаг отмены, второй клиент видит признаки и запрос
- [ ] 2.4 frontend: `TableTools` — «Представление», «Материализованное», «Запрос…» с окном, без «База»/«Базовая» и без «Добавить индекс» у обычного представления, только «Тип» у поля представления в панели и плашке; проверка: компонентные тесты

## 3. Рисование и выгрузка

- [ ] 3.1 frontend: `schemaCells` — представления с ключами, СУБД, шириной, индексами, метками источника и пунктирными связями зависимостей в автораскладке; `DiagramBuilder.table` со стилем; проверка: тесты `erDiagram`
- [ ] 3.2 frontend: `diagramViews`, `diagramSchema` с представлениями, `diagramTables` без них; `schemaSql` — представления в порядке зависимостей, индексы материализованных, заготовка без запроса; Mermaid без представлений; проверка: тесты `erDiagram` и круговой путь
- [ ] 3.3 frontend: `SqlMenu` — сводка и «Таблиц на странице» с представлениями, выгрузки SQL при одних представлениях; `clipboardFormat` — представления в SQL буфера и вставка DDL с одними представлениями; `schemaImportUpdate` — ключи представлений как данные; проверка: тесты `SqlMenu`, буфера и обновления через предложение
- [ ] 3.4 frontend: миграции не видят представлений; проверка: тест `migration`

## 4. Живая база

- [ ] 4.1 backend: `PostgresSchemaReader` — представления и материализованные представления из `pg_get_viewdef` в порядке зависимостей из `pg_depend`, `WITH NO DATA`, индексы материализованных представлений; проверка: unit-тест порядка и интеграционный тест на базе Testcontainers

## 5. Документация и проверка

- [ ] 5.1 docs: README (таблицы, SQL и Mermaid, дампы, «План работ»), «Что нового» и версия frontend; проверка: тест «Что нового»
- [ ] 5.2 e2e: `database-views.spec.ts` — DDL с представлением становится представлением со связями, второй участник видит запрос, «Скопировать SQL» даёт `CREATE VIEW`; проверка: e2e зелёный
- [ ] 5.3 проверка: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `./gradlew build`
