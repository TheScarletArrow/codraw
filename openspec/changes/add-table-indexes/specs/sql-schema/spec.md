# Spec Delta

## MODIFIED Requirements

### Requirement: Импорт SQL

Участник, который правит доску, SHALL добавлять таблицы на текущую страницу из DDL: текста или одного или нескольких
файлов `.sql`. Файлы миграций Flyway SHALL применяться в порядке версий (`V1__`, `V1_1__`, `V2__`, затем `R__`), а
откаты `U…__` — пропускаться. Импорт SHALL понимать `CREATE TABLE`, `ALTER TABLE` (добавление, удаление,
переименование и смена типа столбцов, `SET/DROP NOT NULL`, добавление и удаление ограничений, переименование
таблицы), `DROP TABLE`, `CREATE [UNIQUE] INDEX`, `DROP INDEX` и `ALTER INDEX … RENAME TO` PostgreSQL, а прочие
операторы — пропускать, не прерывая импорт. Перед добавлением участник SHALL видеть число найденных таблиц, связей и
индексов и пропущенных операторов. Каждая таблица SHALL становиться таблицей СУБД PostgreSQL с автошириной и полями
`имя тип` и пометками `PK`, `FK`, `NOT NULL`, `UNIQUE`, а каждый внешний ключ — связью от поля к полю, на которое он
ссылается, с маркерами «воронья лапка». Индексы таблицы SHALL становиться строками её блока «Индексы» в порядке DDL:
`CREATE INDEX`, составные ограничения `UNIQUE (a, b)` и `INDEX`/`KEY` внутри `CREATE TABLE`; первичный ключ и `UNIQUE`
одного столбца SHALL оставаться пометками полей. Индекс без имени SHALL получать имя, которое дал бы ему PostgreSQL,
например `users_org_id_idx` или `users_org_id_email_key`. Переименование столбца SHALL переименовывать его в индексах,
удаление столбца SHALL удалять индексы с ним, `DROP CONSTRAINT` SHALL удалять уникальный индекс с этим именем. Ширина
таблицы SHALL вмещать колонки её полей вместе с целью ссылки и строки её индексов. Таблицы SHALL раскладываться
автораскладкой справа от фигур страницы и добавляться одним шагом отмены у всех участников.

#### Scenario: Миграции Flyway

- **WHEN** участник открывает в «Импорт SQL» файлы `V2__boards.sql` (`CREATE TABLE boards (id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users (id))`) и `V1__users.sql` (`CREATE TABLE users (id uuid PRIMARY KEY, email
  text NOT NULL)`) и нажимает «Добавить на страницу»
- **THEN** на странице таблицы `users` и `boards` со значком PostgreSQL, поле `owner_id uuid FK NOT NULL` связано с
  полем `id uuid PK` таблицы `users` и показывает `→ users.id`, второй участник видит то же, а `Ctrl+Z` убирает обе
  таблицы

#### Scenario: Изменения миграций

- **WHEN** после `CREATE TABLE users (id uuid PRIMARY KEY, mail text)` идёт `ALTER TABLE users RENAME COLUMN mail TO
  email` и `ALTER TABLE users ADD COLUMN name text NOT NULL`
- **THEN** у таблицы `users` поля `id`, `email` и `name text NOT NULL`

#### Scenario: Индексы

- **WHEN** в DDL `CREATE TABLE users (id uuid PRIMARY KEY, org_id uuid, email text, UNIQUE (org_id, email))`,
  `CREATE INDEX ON users (org_id)` и `CREATE UNIQUE INDEX users_email_key ON users USING btree (lower(email)) WHERE
  email IS NOT NULL`
- **THEN** сводка называет 1 таблицу, 3 индекса и 0 пропущенных операторов, а у `users` строки индексов
  `users_org_id_email_key (org_id, email) UNIQUE`, `users_org_id_idx (org_id)` и
  `users_email_key (lower(email)) UNIQUE USING btree WHERE email IS NOT NULL`

#### Scenario: Индексы в миграциях

- **WHEN** после `CREATE INDEX users_mail_idx ON users (mail)` идёт `ALTER TABLE users RENAME COLUMN mail TO email`,
  `ALTER INDEX users_mail_idx RENAME TO users_email_idx` и `DROP INDEX IF EXISTS users_old_idx`
- **THEN** у таблицы `users` индекс `users_email_idx (email)`, а оператор `DROP INDEX` не считается пропущенным

#### Scenario: Пропущенные операторы

- **WHEN** в DDL есть `CREATE VIEW` и функция с телом в `$$ … $$` с точками с запятой внутри
- **THEN** таблицы разбираются, а сводка называет число пропущенных операторов

### Requirement: Выгрузка SQL и Mermaid

Меню «SQL и Mermaid» SHALL выгружать таблицы текущей страницы, в том числе в режиме «Просмотр»: «Скопировать SQL» и
«Скачать .sql» — `CREATE TABLE` PostgreSQL для каждой таблицы, `CREATE [UNIQUE] INDEX имя ON таблица [USING метод]
(столбцы) [остальное]` для каждой строки индекса с именем и столбцами и `ALTER TABLE … ADD FOREIGN KEY` для каждой
связи между полями двух таблиц; «Скопировать Mermaid» — `erDiagram` с таблицами, столбцами, ключами и отношениями, без
индексов. Столбец SHALL читаться из текста поля: имя, тип (без типа — `text`) и пометки `PK`, `FK`, `NOT NULL`,
`UNIQUE`; строки индексов SHALL не становиться столбцами. Без таблиц на странице выгрузки SHALL быть недоступны.

#### Scenario: Круговой путь

- **WHEN** участник импортирует DDL и сразу выбирает «Скопировать SQL»
- **THEN** в буфере обмена DDL с теми же таблицами, столбцами, первичными и внешними ключами и индексами, который
  выполняется в PostgreSQL

#### Scenario: Индекс в SQL

- **WHEN** у таблицы `users` строка индекса `users_org_idx (org_id, created_at) WHERE deleted_at IS NULL`, и участник
  выбирает «Скопировать SQL»
- **THEN** в буфере обмена после `CREATE TABLE users` строка
  `CREATE INDEX users_org_idx ON users (org_id, created_at) WHERE deleted_at IS NULL;`

#### Scenario: Mermaid

- **WHEN** на странице таблицы `users` и `boards` со связью `boards.owner_id` → `users.id`, и участник выбирает
  «Скопировать Mermaid»
- **THEN** в буфере обмена `erDiagram` с блоками `users` и `boards` и строкой `users ||--o{ boards : "owner_id"`
