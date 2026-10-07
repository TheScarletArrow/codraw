# Spec Delta

## MODIFIED Requirements

### Requirement: Выгрузка SQL и Mermaid

Меню «SQL и Mermaid» SHALL выгружать таблицы текущей страницы, в том числе в режиме «Просмотр»: «Скопировать SQL» и
«Скачать .sql» — `CREATE TABLE` PostgreSQL для каждой таблицы, `CREATE [UNIQUE] INDEX имя ON таблица [USING метод]
(столбцы) [остальное]` для каждой строки индекса с именем и столбцами и `ALTER TABLE … ADD FOREIGN KEY` для каждой
связи между полями двух таблиц; «Скопировать Mermaid» — `erDiagram` с таблицами, столбцами, ключами и отношениями, без
индексов. Столбец SHALL читаться из текста поля: имя, тип (без типа — `text`) и пометки `PK`, `FK`, `NOT NULL`,
`UNIQUE`; строки индексов SHALL не становиться столбцами. Без таблиц на странице выгрузки SHALL быть недоступны.
Таблицы моделей из импорта OpenAPI и AsyncAPI SHALL выгружаться, как любые таблицы, а фигуры сервисов и топиков и
фигуры из импорта docker-compose, Kubernetes и Gradle SHALL NOT выгружаться и считаться таблицами. Участнику, который
правит доску, меню SHALL предлагать перед выгрузками «Импорт SQL…», «Импорт Mermaid…», «Импорт OpenAPI / AsyncAPI…»,
«Импорт docker-compose…», «Импорт Kubernetes…» и «Импорт Gradle…», а участнику в режиме «Просмотр» — только выгрузки.

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
