# sql-schema Specification

## Purpose
Превращает DDL базы данных в ER-диаграмму доски и выгружает таблицы страницы обратно в DDL и Mermaid.

## Requirements

### Requirement: Импорт SQL

Участник, который правит доску, SHALL добавлять таблицы на текущую страницу из DDL: текста или одного или нескольких
файлов `.sql`. Файлы миграций Flyway SHALL применяться в порядке версий (`V1__`, `V1_1__`, `V2__`, затем `R__`), а
откаты `U…__` — пропускаться. Импорт SHALL понимать `CREATE TABLE`, `ALTER TABLE` (добавление, удаление,
переименование и смена типа столбцов, `SET/DROP NOT NULL`, добавление и удаление ограничений, переименование
таблицы) и `DROP TABLE` PostgreSQL, а прочие операторы — пропускать, не прерывая импорт. Перед добавлением участник
SHALL видеть число найденных таблиц и связей и пропущенных операторов. Каждая таблица SHALL становиться таблицей
с полями `имя тип` и пометками `PK`, `FK`, `NOT NULL`, `UNIQUE`, а каждый внешний ключ — связью от поля к полю, на
которое он ссылается, с маркерами «воронья лапка». Таблицы SHALL раскладываться автораскладкой справа от фигур
страницы и добавляться одним шагом отмены у всех участников.

#### Scenario: Миграции Flyway

- **WHEN** участник открывает в «Импорт SQL» файлы `V2__boards.sql` (`CREATE TABLE boards (id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users (id))`) и `V1__users.sql` (`CREATE TABLE users (id uuid PRIMARY KEY, email
  text NOT NULL)`) и нажимает «Добавить на страницу»
- **THEN** на странице таблицы `users` и `boards`, поле `owner_id uuid FK NOT NULL` связано с полем `id uuid PK`
  таблицы `users`, второй участник видит то же, а `Ctrl+Z` убирает обе таблицы

#### Scenario: Изменения миграций

- **WHEN** после `CREATE TABLE users (id uuid PRIMARY KEY, mail text)` идёт `ALTER TABLE users RENAME COLUMN mail TO
  email` и `ALTER TABLE users ADD COLUMN name text NOT NULL`
- **THEN** у таблицы `users` поля `id`, `email` и `name text NOT NULL`

#### Scenario: Пропущенные операторы

- **WHEN** в DDL есть `CREATE INDEX` и функция с телом в `$$ … $$` с точками с запятой внутри
- **THEN** таблицы разбираются, а сводка называет число пропущенных операторов

### Requirement: Выгрузка SQL и Mermaid

Меню «SQL» SHALL выгружать таблицы текущей страницы, в том числе в режиме «Просмотр»: «Скопировать SQL» и
«Скачать .sql» — `CREATE TABLE` PostgreSQL для каждой таблицы и `ALTER TABLE … ADD FOREIGN KEY` для каждой связи между
полями двух таблиц; «Скопировать Mermaid» — `erDiagram` с таблицами, столбцами, ключами и отношениями. Столбец SHALL
читаться из текста поля: имя, тип (без типа — `text`) и пометки `PK`, `FK`, `NOT NULL`, `UNIQUE`. Без таблиц на
странице выгрузки SHALL быть недоступны.

#### Scenario: Круговой путь

- **WHEN** участник импортирует DDL и сразу выбирает «Скопировать SQL»
- **THEN** в буфере обмена DDL с теми же таблицами, столбцами, первичными и внешними ключами, который выполняется в
  PostgreSQL

#### Scenario: Mermaid

- **WHEN** на странице таблицы `users` и `boards` со связью `boards.owner_id` → `users.id`, и участник выбирает
  «Скопировать Mermaid»
- **THEN** в буфере обмена `erDiagram` с блоками `users` и `boards` и строкой `users ||--o{ boards : "owner_id"`
