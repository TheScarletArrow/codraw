# Tasks

## 1. Дампы

- [ ] 1.1 frontend: `sql/fixtures/` — исходные схемы и настоящие дампы `pg_dump` 18 (`--schema-only` с владельцами и правами и с `--no-owner --no-privileges`, полный с данными), `mysqldump` 8.4 и `mariadb-dump` 11.8 с `--no-data --routines --triggers`; проверка: файлы — вывод утилит без правок
- [ ] 1.2 frontend: `sql/parseSql.ts` — лексема конца оператора, строки `\…` psql, `DELIMITER`, данные `COPY … FROM stdin` до `\.`, `SET DEFAULT nextval` → `serial`, секции (`ATTACH PARTITION`, `PARTITION OF`, `ALTER INDEX … ATTACH PARTITION`), тип без схемы, `CHARACTER SET` MySQL, столбцы ограничений по первому имени элемента; проверка: unit-тесты на каждый случай
- [ ] 1.3 frontend: `sql/statementKinds.ts` — служебные операторы и данные не считаются пропущенными; проверка: unit-тесты видов операторов и сводки
- [ ] 1.4 frontend: тесты на фикстурах — таблицы, поля, PK, FK, UNIQUE, индексы и число пропущенных для каждого дампа; полный дамп даёт ту же схему, что дамп схемы; проверка: `vitest run src/sql`
- [ ] 1.5 frontend: подсказка о `pg_dump --schema-only` и `mysqldump --no-data` в «Импорт SQL»; проверка: тест `SqlMenu`

## 2. Подключение к базе: backend

- [ ] 2.1 backend: `schemaimport/SchemaImportProperties` (`allowed-hosts`, таймауты, `max-tables`, `max-ddl-size`), `AllowedHosts` (разбор записей, имена, сети, особые адреса, адреса базы CoDraw), `HostResolver`; предел `schema-imports-per-user-per-hour` в `LimitProperties`; проверка: unit-тесты разбора и проверки адресов
- [ ] 2.2 backend: `PinnedSocketFactory` и свойства драйвера из белого списка, `org.postgresql` при компиляции; проверка: unit-тест свойств и подмены адреса
- [ ] 2.3 backend: `PostgresSchemaReader` — каталог одной схемы в DDL как у `pg_dump`, пределы таблиц и размера, тайм-ауты, только чтение, категории ошибок; проверка: интеграционные тесты на базе Testcontainers
- [ ] 2.4 backend: `SchemaImportController` — `GET`/`POST /api/schema-import`, 404 без адресов, 403 гостю и неразрешённому адресу, 400 без значений полей, 429 с `Retry-After`, журнал и метрика `codraw.schema.imports`, `Limit.SCHEMA_IMPORTS`; `schemaImport` в `GET /api/legal`; проверка: `@IntegrationTest` — DDL, отказы, rebinding, лишние параметры, тайм-аут, пароль не в журнале и ответах, предел
- [ ] 2.5 backend: `application.yaml` (выключено), `application-e2e.yaml` (`localhost`), `.env.example`, `.env.prod.example`, `docker-compose.prod.yml`; проверка: `./gradlew build`

## 3. Подключение к базе: frontend

- [ ] 3.1 frontend: `sql/connectionString.ts` — `jdbc:postgresql://`, `postgresql://`, `postgres://`, `host=… dbname=…`, только разрешённые параметры; проверка: unit-тесты форматов и отброшенных параметров
- [ ] 3.2 frontend: `api/schemaImport.ts` и `sql/DatabaseConnection.tsx` — поля, строка подключения, «Загрузить схему», ошибки по `reason`, пароль только в открытом окне; «Подключиться к базе…» и подсказка гостю в `SqlMenu`; проверка: компонентные тесты — выключено, гость, загрузка в поле DDL, ошибки, пароль стирается
- [ ] 3.3 frontend: политика конфиденциальности о подключении к базе при `schemaImport`; проверка: тест страниц документов

## 4. Документация

- [ ] 4.1 docs: ADR-0007 о подключении к живой базе, `docs/deploy.md` (как включить и чем рискует администратор), `docs/running.md`, README (возможности, ADR, «План работ»), «Что нового» 0.6.0; проверка: документы описывают дампы и подключение

## 5. Сквозная проверка

- [ ] 5.1 e2e: `live-schema-import.spec.ts` — дамп `pg_dump` через окно становится таблицами со связями; подключение к базе e2e по строке `postgresql://…` и паролю даёт таблицы CoDraw; проверка: `live-schema-import.spec.ts`, `sql-schema.spec.ts`, `whats-new.spec.ts` и `legal.spec.ts` зелёные
