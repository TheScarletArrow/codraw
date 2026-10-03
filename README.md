# CoDraw

**CoDraw** — веб-редактор диаграмм, аналог [draw.io](https://www.drawio.com), созданный для совместной работы.

Несколько человек одновременно редактируют одну диаграмму и в реальном времени видят изменения,
курсоры и выделения друг друга. Совместная работа здесь — основной сценарий, а не надстройка
над однопользовательским редактором.

## Возможности (план)

- **Редактор диаграмм** — фигуры, коннекторы, текст, группы, страницы, стили, сетка и привязка.
- **Совместное редактирование в реальном времени** — без блокировок и конфликтов (CRDT).
- **Присутствие** — курсоры, выделения и аватары участников.
- **Undo/redo для каждого участника** — отменяются только свои действия, а не чужие.
- **Офлайн-режим** — правки сохраняются локально и синхронизируются при восстановлении связи.
- **Доступ и роли** — приглашения и ссылки с ролями: владелец, редактор, комментатор, читатель.
- **Комментарии** к элементам диаграммы.
- **История версий** — просмотр и откат к предыдущим состояниям.
- **Импорт/экспорт** — `.drawio`, PNG, SVG, PDF.

## Технологический стек

> Статус: **предложение**, ожидает согласования.
> Обоснование и альтернативы — в [ADR-0001](docs/adr/0001-tech-stack.md).

| Слой               | Технологии                                                     |
|--------------------|----------------------------------------------------------------|
| Frontend           | TypeScript, React, Vite                                        |
| Холст диаграмм     | maxGraph (наследник mxGraph — движка draw.io)                  |
| UI                 | Tailwind CSS, shadcn/ui                                        |
| Совместная работа  | Yjs (CRDT), y-protocols awareness, y-indexeddb (офлайн)        |
| Collab-сервер      | Hocuspocus (Node.js, WebSocket)                                |
| Backend API        | Kotlin, Spring Boot 4, JDK 25                                  |
| Хранение           | PostgreSQL + Flyway, S3-совместимое хранилище (MinIO локально) |
| Аутентификация     | Вход через GitHub/Google, JWT от backend                       |
| Тесты              | JUnit 5, Testcontainers, Vitest, Playwright                    |
| Инфраструктура     | Docker, Docker Compose, GitHub Actions                         |

## Структура репозитория

```
codraw/
├── backend/    # Kotlin + Spring Boot: пользователи, доски, права, версии
├── collab/     # сервер синхронизации Yjs (Hocuspocus)
├── frontend/   # React-приложение с редактором
├── openspec/   # спецификации и запланированные изменения (OpenSpec)
└── docs/adr/   # архитектурные решения
```

## Разработка

Нужны JDK 25, Node.js 22.12+ (рекомендуется версия из `.nvmrc`), pnpm 10 (`corepack enable`) и Docker.

```bash
pnpm install                       # зависимости frontend, collab и e2e
docker compose up -d postgres      # PostgreSQL 18 на localhost:5432

# каждый сервис — в отдельном терминале
cd backend && ./gradlew bootRun    # API: http://localhost:8080
pnpm dev:collab                    # синхронизация: ws://localhost:1234
pnpm dev:frontend                  # приложение: http://localhost:5173
```

Приложение открывается на http://localhost:5173. Dev-сервер Vite проксирует `/api` в backend
и `/collab` в collab, поэтому всё работает с одного origin. Внутренний API backend (`/internal/**`)
наружу не проксируется.

Для локальной разработки переменные окружения задавать не нужно:

- `./gradlew bootRun` включает профиль `dev` (`backend/src/main/resources/application-dev.yaml`);
- `pnpm dev:collab` читает `collab/.env.development`;
- `docker compose` берёт значения по умолчанию из `docker-compose.yml`.

Вне разработки сервисы настраиваются переменными окружения — список с пояснениями в `.env.example`.
Backend без `CODRAW_INTERNAL_TOKEN` и настроек БД не запустится. Токен должен совпадать у backend
и collab.

### Проверки

Проверки, которые запускает CI:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build   # frontend, collab, e2e
cd backend && ./gradlew build                            # backend; тестам нужен Docker (Testcontainers)
```

Сквозные тесты запускают собранные сервисы и ходят в PostgreSQL из docker compose:

```bash
docker compose up -d postgres
(cd backend && ./gradlew bootJar)
pnpm --filter @codraw/collab --filter @codraw/frontend build
pnpm --filter @codraw/e2e exec playwright install chromium   # один раз
pnpm test:e2e
```

Порты 8080, 1234, 1235 и 4173 при этом должны быть свободны.

## Спецификации

Работа ведётся по [OpenSpec](https://github.com/Fission-AI/OpenSpec):

- `openspec/specs/` — действующие требования к системе;
- `openspec/changes/` — запланированные изменения: зачем (`proposal.md`), как (`design.md`),
  что поменяется в требованиях (`specs/`) и задачи (`tasks.md`).

CLI ставится через `npm i -g @fission-ai/openspec`. В Claude Code доступны команды `/opsx:propose`,
`/opsx:apply` и `/opsx:archive`.

## План работ

1. ~~`bootstrap-monorepo` — каркасы подпроектов и CI~~ — готово.
2. ~~`add-board-sync` — доски в PostgreSQL и синхронизация в реальном времени~~ — готово.
3. `add-diagram-editor` — холст maxGraph: фигуры, связи, подписи, undo, курсоры участников.
4. `add-user-auth` — вход через GitHub/Google и доступ только к своим доскам.

Дальше: совместный доступ и роли, импорт и экспорт `.drawio`, несколько страниц, история версий,
офлайн-режим, Docker-образы и деплой.
