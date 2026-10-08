# Spec Delta

## MODIFIED Requirements

### Requirement: Чтение схемы

`backend` SHALL читать одну схему: обычные и партиционированные таблицы без секций, их столбцы с типами,
`NOT NULL`, значениями по умолчанию, identity и вычисляемыми столбцами, первичные и уникальные ключи, `CHECK`,
индексы (кроме индексов ограничений) таблиц и материализованных представлений, внешние ключи, представления и
материализованные представления, — и отдавать `{ddl, tables}`: DDL PostgreSQL как у `pg_dump` — `CREATE TABLE`, затем
`CREATE VIEW … AS` и `CREATE MATERIALIZED VIEW … AS … WITH NO DATA` с определением из `pg_get_viewdef` в порядке
зависимостей представлений друг от друга (при равенстве — по имени), затем `ALTER TABLE ONLY … ADD CONSTRAINT …` из
`pg_get_constraintdef`, `CREATE INDEX` из `pg_get_indexdef` и внешние ключи последними. Столбец с принадлежащей ему
последовательностью SHALL быть `serial`, `bigserial` или `smallserial`. `tables` и предел числа таблиц SHALL считать
только таблицы. Нет схемы — 422 `schema-not-found`; больше 500 таблиц или больше 2 МБ DDL — 422 `too-large`; сервер
старше PostgreSQL 12 — 422 `unsupported-server`.

#### Scenario: Схема с ключами

- **WHEN** в схеме `shop` таблицы `users` (`id bigserial PRIMARY KEY`, `email text UNIQUE`) и `orders` с внешним
  ключом `user_id` на `users` и частичным индексом
- **THEN** DDL содержит `CREATE TABLE users` с `id bigserial NOT NULL`, `ADD CONSTRAINT users_pkey PRIMARY KEY (id)`,
  `CREATE INDEX` частичного индекса и `FOREIGN KEY (user_id) REFERENCES users(id)`, а `tables` — 2

#### Scenario: Представления схемы

- **WHEN** в схеме `shop` представление `active_orders` из `orders`, материализованное представление `order_totals`
  из `active_orders` с индексом и представление `big_orders` из `order_totals`
- **THEN** DDL после `CREATE TABLE` содержит `CREATE VIEW active_orders AS`, затем `CREATE MATERIALIZED VIEW
  order_totals AS … WITH NO DATA`, затем `CREATE VIEW big_orders AS`, и `CREATE INDEX` индекса `order_totals`, а
  `tables` считает только таблицы

#### Scenario: Слишком большая схема

- **WHEN** в схеме больше таблиц, чем `codraw.schema-import.max-tables`
- **THEN** ответ — 422 с `reason: too-large` и `limit`
