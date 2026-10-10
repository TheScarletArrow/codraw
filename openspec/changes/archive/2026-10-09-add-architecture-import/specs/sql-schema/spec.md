# Spec Delta

## MODIFIED Requirements

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
топиков и фигуры из импорта docker-compose, Kubernetes, Gradle, Terraform и архитектуры как кода SHALL NOT
выгружаться и считаться таблицами.
Участнику, который правит доску, меню SHALL предлагать перед выгрузками «Импорт SQL…», «Импорт Mermaid…», «Импорт
OpenAPI / AsyncAPI…», «Импорт docker-compose…», «Импорт Kubernetes…», «Импорт Gradle…», «Импорт Terraform…» и
«Импорт архитектуры как кода…», а участнику в режиме «Просмотр» — только выгрузки.

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

#### Scenario: Элементы архитектуры как кода

- **WHEN** на странице «Граница системы» «Магазин» с Container «API» и Database «База данных» из импорта Structurizr
  DSL, и участник открывает меню «SQL и Mermaid»
- **THEN** меню показывает «Таблиц на странице: 0», а «Скопировать SQL» недоступно
