# sql-schema Specification

## Purpose
Превращает DDL базы данных в ER-диаграмму доски и выгружает таблицы страницы обратно в DDL и Mermaid.

## Requirements

### Requirement: Импорт SQL

Участник, который правит доску, SHALL добавлять таблицы и представления на текущую страницу из DDL: текста или одного
или нескольких файлов `.sql`. Файлы миграций Flyway SHALL применяться в порядке версий (`V1__`, `V1_1__`, `V2__`,
затем `R__`), а откаты `U…__` — пропускаться. Импорт SHALL понимать `CREATE TABLE`, `ALTER TABLE` (добавление,
удаление, переименование и смена типа столбцов, `SET/DROP NOT NULL`, добавление и удаление ограничений,
переименование таблицы), `DROP TABLE`, `CREATE [UNIQUE] INDEX`, `DROP INDEX` и `ALTER INDEX … RENAME TO` PostgreSQL,
а также `CREATE [OR REPLACE] [TEMP] [RECURSIVE] VIEW`, `CREATE MATERIALIZED VIEW [IF NOT EXISTS]`, `VIEW` MySQL с
`ALGORITHM`, `DEFINER` и `SQL SECURITY`, `ALTER [MATERIALIZED] VIEW … RENAME TO`, `ALTER [MATERIALIZED] VIEW … RENAME
[COLUMN] … TO`, `DROP [MATERIALIZED] VIEW` и индексы материализованных представлений. Операторы об объектах, которых
нет на диаграмме (`FUNCTION`, `PROCEDURE`, `TRIGGER`, `TYPE`, `DOMAIN`, `CREATE TABLE … AS`), операторы о таблицах и
представлениях, которых нет в тексте, и непонятые операторы SHALL пропускаться, не прерывая импорт, и считаться
пропущенными. Служебные операторы, которые не описывают таблиц, — настройки сеанса и клиента (`SET`, `RESET`, `USE`,
`SELECT set_config(…)`, `SELECT setval(…)`), транзакции и блокировки, владельцы и права (`… OWNER TO`, `GRANT`,
`REVOKE`, `ALTER DEFAULT PRIVILEGES`, роли), комментарии `COMMENT ON`, схемы, базы, расширения и последовательности,
удаление объектов, которых нет на диаграмме, — и данные (`INSERT`, `COPY`, `UPDATE`, `DELETE`, `REPLACE`, `TRUNCATE`,
`REFRESH MATERIALIZED VIEW`) SHALL пропускаться и не считаться пропущенными. Перед добавлением участник SHALL видеть
число найденных таблиц, представлений, связей и индексов и пропущенных операторов. Каждая таблица SHALL становиться
таблицей СУБД PostgreSQL с автошириной и полями `имя тип` и пометками `PK`, `FK`, `NOT NULL`, `UNIQUE`, а каждый
внешний ключ — связью от поля к полю, на которое он ссылается, с маркерами «воронья лапка». Индексы таблицы SHALL
становиться строками её блока «Индексы» в порядке DDL: `CREATE INDEX`, составные ограничения `UNIQUE (a, b)` и
`INDEX`/`KEY` внутри `CREATE TABLE`; первичный ключ и `UNIQUE` одного столбца SHALL оставаться пометками полей. Индекс
без имени SHALL получать имя, которое дал бы ему PostgreSQL, например `users_org_id_idx` или `users_org_id_email_key`.
Переименование столбца SHALL переименовывать его в индексах, удаление столбца SHALL удалять индексы с ним, `DROP
CONSTRAINT` SHALL удалять уникальный индекс с этим именем. Ширина таблицы SHALL вмещать колонки её полей вместе с
целью ссылки и строки её индексов. Каждое представление SHALL становиться представлением (материализованным для
`MATERIALIZED`) СУБД PostgreSQL с автошириной, запросом — текстом после `AS` без `WITH [NO] DATA` — и полями
`имя тип`. Столбцы представления SHALL браться из его списка столбцов, иначе из списка первого `SELECT` запроса:
псевдоним, последняя часть имени столбца, имя функции или `?column?`, а `*` и `t.*` — столбцы таблиц и представлений
из `FROM` в момент `CREATE VIEW`. Тип столбца SHALL быть типом столбца таблицы или представления, на который ссылается
выражение (у `serial`, `bigserial` и `smallserial` — `integer`, `bigint` и `smallint`), приведением `::тип` или `CAST(… AS тип)`, типом литерала (`text`, `integer`, `numeric`, `boolean`) или
`bigint` у `count(…)`, а иначе столбец SHALL быть без типа. От представления SHALL идти пунктирная связь к каждой
таблице и представлению импорта, из которых читает его запрос (`FROM` и `JOIN` на любой глубине). Таблицы и
представления SHALL раскладываться автораскладкой справа от фигур страницы и добавляться одним шагом отмены у всех
участников.

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

#### Scenario: Представление

- **WHEN** в DDL таблицы `users (id uuid PRIMARY KEY, email text NOT NULL)` и `orders (id bigint PRIMARY KEY, user_id
  uuid REFERENCES users)` и `CREATE VIEW user_orders AS SELECT u.id, u.email, count(o.id) AS orders FROM users u LEFT
  JOIN orders o ON o.user_id = u.id GROUP BY u.id`, и участник нажимает «Добавить на страницу»
- **THEN** сводка называет 2 таблицы, 1 представление и 0 пропущенных операторов, на странице представление
  `user_orders` со значком «VIEW», полями `id uuid`, `email text`, `orders bigint` и запросом `SELECT u.id, … GROUP BY
  u.id`, а от него идут пунктирные связи к `users` и `orders`

#### Scenario: Материализованное представление

- **WHEN** после таблицы `orders` идёт `CREATE MATERIALIZED VIEW order_totals (user_id, total) AS SELECT user_id,
  sum(amount)::numeric(12, 2) FROM orders GROUP BY user_id WITH NO DATA`, `CREATE UNIQUE INDEX ON order_totals
  (user_id)` и `REFRESH MATERIALIZED VIEW order_totals`
- **THEN** `order_totals` — материализованное представление со значком «MAT VIEW», полями `user_id` с типом столбца
  `orders.user_id` и `total numeric(12, 2)` и индексом `order_totals_user_id_idx (user_id) UNIQUE`, а пропущенных
  операторов нет

#### Scenario: Представления в миграциях

- **WHEN** после `CREATE TABLE notes (id serial PRIMARY KEY, body text)` и `CREATE VIEW recent AS SELECT * FROM notes`
  идёт `ALTER VIEW recent RENAME TO recent_notes`, а затем `DROP VIEW IF EXISTS old_notes`
- **THEN** на странице представление `recent_notes` с полями `id integer` и `body text`, и ни один оператор не
  пропущен

#### Scenario: Пропущенные операторы

- **WHEN** в DDL есть `CREATE TYPE … AS ENUM` и функция с телом в `$$ … $$` с точками с запятой внутри
- **THEN** таблицы разбираются, а сводка называет 2 пропущенных оператора

#### Scenario: Служебные операторы не пропущены

- **WHEN** в DDL кроме `CREATE TABLE notes (id serial PRIMARY KEY)` есть `SET search_path = public`,
  `CREATE EXTENSION pgcrypto`, `CREATE SEQUENCE notes_seq`, `COMMENT ON TABLE notes IS 'Заметки'`,
  `ALTER TABLE notes OWNER TO app`, `GRANT SELECT ON notes TO reporting` и `INSERT INTO notes DEFAULT VALUES`
- **THEN** сводка называет 1 таблицу и 0 пропущенных операторов

### Requirement: Выгрузка SQL и Mermaid

Меню «SQL и Mermaid» SHALL выгружать таблицы и представления текущей страницы, в том числе в режиме «Просмотр»:
«Скопировать SQL» и «Скачать .sql» — `CREATE TABLE` PostgreSQL для каждой таблицы, `CREATE [UNIQUE] INDEX имя ON
таблица [USING метод] (столбцы) [остальное]` для каждой строки индекса с именем и столбцами, `ALTER TABLE … ADD
FOREIGN KEY` для каждой связи между полями двух таблиц, а затем, в порядке зависимостей запросов друг от друга,
`CREATE VIEW имя AS запрос;` для каждого представления и `CREATE MATERIALIZED VIEW имя AS запрос;` с `CREATE [UNIQUE]
INDEX` его строк индексов для каждого материализованного; представление без запроса SHALL выгружаться заготовкой
`SELECT NULL::тип AS столбец, …` с комментарием. «Скопировать Mermaid» — `erDiagram` с таблицами, столбцами, ключами
и отношениями, без индексов и представлений. Столбец SHALL читаться из текста поля: имя, тип (без типа — `text`) и
пометки `PK`, `FK`, `NOT NULL`, `UNIQUE`; строки индексов SHALL не становиться столбцами, а связи с полями
представлений SHALL не становиться внешними ключами. Без таблиц и представлений на странице выгрузки SQL SHALL быть
недоступны, без таблиц — «Скопировать Mermaid». Меню SHALL называть число таблиц на странице, а при представлениях —
и их число. Таблицы моделей из импорта OpenAPI и AsyncAPI SHALL выгружаться, как любые таблицы, а фигуры сервисов и
топиков и фигуры из импорта docker-compose, Kubernetes, Gradle и Terraform SHALL NOT выгружаться и считаться таблицами.
Участнику, который правит доску, меню SHALL предлагать перед выгрузками «Импорт SQL…», «Импорт Mermaid…», «Импорт
OpenAPI / AsyncAPI…», «Импорт docker-compose…», «Импорт Kubernetes…», «Импорт Gradle…» и «Импорт Terraform…», а
участнику в режиме «Просмотр» — только выгрузки.

#### Scenario: Круговой путь

- **WHEN** участник импортирует DDL и сразу выбирает «Скопировать SQL»
- **THEN** в буфере обмена DDL с теми же таблицами, столбцами, первичными и внешними ключами, индексами и
  представлениями с их запросами, который выполняется в PostgreSQL

#### Scenario: Индекс в SQL

- **WHEN** у таблицы `users` строка индекса `users_org_idx (org_id, created_at) WHERE deleted_at IS NULL`, и участник
  выбирает «Скопировать SQL»
- **THEN** в буфере обмена после `CREATE TABLE users` строка
  `CREATE INDEX users_org_idx ON users (org_id, created_at) WHERE deleted_at IS NULL;`

#### Scenario: Представления в SQL

- **WHEN** на странице таблица `users`, представление `active_users` с запросом `SELECT * FROM users WHERE deleted_at
  IS NULL` и материализованное представление `user_counts` с запросом `SELECT count(*) AS total FROM active_users`, и
  участник выбирает «Скопировать SQL»
- **THEN** меню показывает «Таблиц на странице: 1, представлений: 2», а в буфере обмена после `CREATE TABLE users`
  строки `CREATE VIEW active_users AS SELECT * FROM users WHERE deleted_at IS NULL;` и затем
  `CREATE MATERIALIZED VIEW user_counts AS SELECT count(*) AS total FROM active_users;`, а «Скопировать Mermaid» даёт
  только `users`

#### Scenario: Mermaid

- **WHEN** на странице таблицы `users` и `boards` со связью `boards.owner_id` → `users.id`, и участник выбирает
  «Скопировать Mermaid»
- **THEN** в буфере обмена `erDiagram` с блоками `users` и `boards` и строкой `users ||--o{ boards : "owner_id"`

#### Scenario: Сервис и модели

- **WHEN** на странице сервис «Petstore» и таблицы `Pet` и `Error` из импорта OpenAPI, и участник открывает меню и
  выбирает «Скопировать SQL»
- **THEN** меню показывает «Таблиц на странице: 2», а в буфере обмена `CREATE TABLE "Pet"` и `CREATE TABLE "Error"`
  и ничего о сервисе

#### Scenario: Сервисы docker-compose

- **WHEN** на странице «База данных» `postgres` и «Контейнер» `backend` из импорта docker-compose, и участник открывает
  меню «SQL и Mermaid»
- **THEN** меню показывает «Таблиц на странице: 0», а «Скопировать SQL» недоступно

#### Scenario: Нагрузки Kubernetes

- **WHEN** на странице «База данных» `postgres` и «API-шлюз» `shop` из импорта Kubernetes, и участник открывает меню
  «SQL и Mermaid»
- **THEN** меню показывает «Таблиц на странице: 0», а «Скопировать SQL» недоступно

#### Scenario: Модули Gradle

- **WHEN** на странице «Компоненты» `:app` и `:core` из импорта Gradle, и участник открывает меню «SQL и Mermaid»
- **THEN** меню показывает «Таблиц на странице: 0», а «Скопировать SQL» недоступно

#### Scenario: Ресурсы Terraform

- **WHEN** на странице «База данных» `aws_db_instance.main` и «Сервер» `aws_instance.web` из импорта Terraform, и
  участник открывает меню «SQL и Mermaid»
- **THEN** меню показывает «Таблиц на странице: 0», а «Скопировать SQL» недоступно

### Requirement: Импорт дампов

«Импорт SQL» SHALL понимать вывод `pg_dump` (схема и полный дамп, с владельцами и правами и без) и `mysqldump` и
`mariadb-dump` с `--no-data --routines --triggers` и давать те же таблицы, представления, поля, первичные и внешние
ключи, уникальные столбцы и индексы, что и DDL, из которого снята схема. Строка, которая начинается с `\`
(мета-команды psql `\restrict`, `\unrestrict`, `\connect`), SHALL пропускаться. Строка `DELIMITER xx` в начале
оператора SHALL делать `xx` концом оператора до следующего `DELIMITER`, и точки с запятой внутри SHALL не делить
оператор. Исполняемый комментарий MySQL `/*!NNNNN … */` SHALL читаться как код, а `/*M!… */` MariaDB и обычные
комментарии — нет. Строки данных после `COPY … FROM stdin;` до строки `\.` SHALL пропускаться. `ALTER TABLE … ALTER
COLUMN … SET DEFAULT nextval(…)` у столбца `integer`, `bigint` или `smallint` SHALL делать его тип `serial`,
`bigserial` или `smallserial`. Секция партиционированной таблицы (`ALTER TABLE … ATTACH PARTITION` или `CREATE TABLE …
PARTITION OF`) SHALL не становиться таблицей, а операторы о ней SHALL не считаться пропущенными. Схема у типа столбца
SHALL отбрасываться, как у имени таблицы, а `CHARACTER SET` столбца MySQL SHALL не входить в его тип. Окно «Импорт
SQL» SHALL подсказывать, что схему существующей базы можно снять командой `pg_dump --schema-only` или `mysqldump
--no-data` и открыть файлом.

#### Scenario: Дамп pg_dump

- **WHEN** участник открывает в «Импорт SQL» вывод `pg_dump --schema-only` версии 18 со строками `\restrict` и
  `\unrestrict`, таблицей `users` (`id bigserial PRIMARY KEY`, уникальный `email`), заказами с внешним ключом на неё,
  таблицей схемы `app`, секцией партиционированной таблицы, типом `ENUM`, представлением, функцией и триггером
- **THEN** сводка называет таблицы без секции, представление, их внешние ключи и индексы и 3 пропущенных оператора, у
  `users` поле `id bigserial PK`, у заказов поле `status order_status NOT NULL`, а представление `active_orders` —
  столбцы заказов с их типами

#### Scenario: Дамп mysqldump

- **WHEN** участник открывает вывод `mysqldump --no-data --routines --triggers` с `/*!40101 SET … */`, таблицами с
  `AUTO_INCREMENT`, `KEY`, `UNIQUE KEY`, `CONSTRAINT … FOREIGN KEY`, `ENGINE=InnoDB` и `COMMENT`, представлением
  `paid_orders` в комментариях `/*!50001 … */`, триггером и процедурой между `DELIMITER ;;` и `DELIMITER ;`
- **THEN** все таблицы с полями, ключами и индексами на месте, `paid_orders` — представление с полями `id int unsigned`,
  `user_id int unsigned` и `total decimal(12, 2)`, а триггер и процедура — два пропущенных оператора

#### Scenario: Полный дамп с данными

- **WHEN** участник открывает вывод `pg_dump` с данными, где в строках `COPY … FROM stdin` есть апостроф и `;`
- **THEN** таблицы, первичные и внешние ключи такие же, как из дампа схемы, а данные не считаются пропущенными

#### Scenario: Подсказка о дампах

- **WHEN** участник открывает «Импорт SQL»
- **THEN** окно называет команды `pg_dump --schema-only` и `mysqldump --no-data`
