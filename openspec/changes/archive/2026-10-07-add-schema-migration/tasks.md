# Tasks

## 1. Схема состояния доски

- [x] 1.1 frontend: `sql/erDiagram.ts` — `diagramTables` (таблицы страницы с id ячеек таблиц, полей, индексов и связей, стилем и типом поля, как он написан), `diagramSchema` поверх неё; `sql/tableIndex.ts` — `mapIndexColumns` (замена имён столбцов индекса, `renameIndexColumn` поверх неё); проверка: unit-тесты `erDiagram.test.ts` и `tableIndex.test.ts`, выгрузка SQL не меняется
- [x] 1.2 frontend: `sql/sqlTypes.ts` — тот же тип (регистр, пробелы, синонимы) и расширяющая смена типа; проверка: unit-тесты `sqlTypes.test.ts`

## 2. Генератор миграции

- [x] 2.1 frontend: `sql/migration.ts` — `boardSchema` (все страницы, ключи `<страница>/<элемент>`, базовые таблицы, первое из одноимённых), сопоставление по ключу и имени, план по фазам: таблицы, столбцы, тип, `NOT NULL`, `UNIQUE`, первичный ключ, индексы, внешние ключи, производные имена ограничений с усечением и их переименование, пересоздание внешних ключей, порядок и циклы переименований, опасные операции, СУБД по умолчанию; проверка: unit-тесты `migration.test.ts` на каждый случай
- [x] 2.2 frontend: `sql/dialects.ts` — PostgreSQL, MySQL / MariaDB, Oracle, SQL Server, SQLite, ClickHouse: кавычки и зарезервированные слова, операторы каждой операции, комментарии для невозможного, признаки переименования ограничений; проверка: unit-тесты `dialects.test.ts` и сценарии `migration.test.ts` для всех СУБД
- [x] 2.3 frontend: `sql/migrationFiles.ts` — SQL с заголовком, пара Flyway `V`/`U` (версия, описание в имени файла), Liquibase formatted SQL с `--rollback`, сводка; проверка: unit-тесты `migrationFiles.test.ts`

## 3. Интерфейс

- [x] 3.1 frontend: `sql/SchemaMigrationMenu.tsx` — окно «Миграция SQL»: СУБД, формат, поля Flyway и Liquibase, сводка, предпросмотр файлов, «Скопировать», «Скачать», «Схема таблиц не изменилась», неверная версия; проверка: компонентные тесты `SchemaMigrationMenu.test.tsx`
- [x] 3.2 frontend: `diagram/merge.ts` — `mergedSnapshot` (доска с принятым предложением без правки доски); «Миграция SQL» в `VersionPreview` при сравнении и в `ProposalReview`; проверка: unit-тест `merge.test.ts`, тесты `BoardPage` (версия и предложение)

## 4. Сквозная проверка и документация

- [x] 4.1 e2e: владелец импортирует таблицу, сохраняет версию, переименовывает поле, открывает версию, «Сравнить с текущей» → «Миграция SQL»: `RENAME COLUMN` в SQL и пара Flyway; проверка: Playwright `schema-migration.spec.ts`
- [x] 4.2 docs: README («Возможности», «История версий», «Предложения изменений», новый раздел «Миграция SQL», «План работ»), `docs/running.md`, «Что нового» 0.6.0 и версия `frontend/package.json`; проверка: документация описывает «Миграция SQL», СУБД и форматы
